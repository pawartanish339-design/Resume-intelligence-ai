import { AppError, errorMessage, logSafe } from '@/lib/utils/errors';
import type { DocumentComplexityMetrics } from '@/types/resume';

/**
 * OCR fallback for image-only (scanned) PDFs.
 *
 * Pipeline: pdfjs renders each page into an offscreen canvas at ~300 DPI
 * (scale 4.17 for a 72 DPI PDF), we convert to grayscale and binarise with Otsu's
 * method, then tesseract.js recognises the bitmap. Capped at 5 pages because OCR
 * is slow (~1-3s/page) and the first pages carry the most signal.
 */

export const MAX_OCR_PAGES = 5;
/** 72 * 4.17 ~= 300 DPI */
export const OCR_RENDER_SCALE = 4.17;
const OCR_LANG = 'eng';

export interface OcrResult {
  text: string;
  pagesProcessed: number;
  pagesAvailable: number;
  confidence: number;
  timings: { render_ms: number; recognize_ms: number };
  used: boolean;
  reason?: string;
}

/**
 * Otsu's method: choose the threshold that minimises intra-class variance.
 * Deterministic and dependency-free.
 */
export function otsuThreshold(histogram: Uint32Array, total: number): number {
  if (total === 0) return 128;

  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * (histogram[i] ?? 0);

  let sumBackground = 0;
  let weightBackground = 0;
  let maxVariance = -1;
  let threshold = 128;

  for (let i = 0; i < 256; i += 1) {
    const count = histogram[i] ?? 0;
    weightBackground += count;
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * count;
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;

    if (between > maxVariance) {
      maxVariance = between;
      threshold = i;
    }
  }

  return threshold;
}

/** Convert an RGBA buffer to grayscale in place using the Rec. 601 luma weights. */
export function toGrayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
}

/** Binarise an already-grayscaled RGBA buffer using the supplied threshold. */
export function binarize(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] ?? 0) >= threshold ? 255 : 0;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }
}

export function buildHistogram(data: Uint8ClampedArray): { histogram: Uint32Array; total: number } {
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i] ?? 0] += 1;
    total += 1;
  }
  return { histogram, total };
}

interface OcrOptions {
  maxPages?: number;
  /** Injectable for tests. */
  recognizerFactory?: (language: string) => Promise<{
    recognize: (image: unknown) => Promise<{ data: { text: string; confidence: number } }>;
    terminate: () => Promise<unknown>;
  }>;
}

/**
 * Rasterise and OCR a PDF. Never throws for "nothing recognised" -- the caller
 * decides what to do based on `text`/`used`; infrastructure failures are logged
 * and surfaced as `used: false` with a reason so the route can return 422.
 */
export async function ocrPdf(
  buffer: Buffer,
  options: OcrOptions = {},
): Promise<{ result: OcrResult; complexity: Partial<DocumentComplexityMetrics> }> {
  const startedAt = Date.now();
  const maxPages = options.maxPages ?? MAX_OCR_PAGES;

  const emptyComplexity: Partial<DocumentComplexityMetrics> = {};

  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  let canvasModule: typeof import('@napi-rs/canvas');
  let tesseract: typeof import('tesseract.js');

  try {
    const { loadPdfJs, loadCanvas } = await import('@/lib/services/pdf-runtime');
    pdfjs = await loadPdfJs();
    canvasModule = await loadCanvas();
    tesseract = (await import('tesseract.js')) as unknown as typeof import('tesseract.js');
  } catch (error) {
    logSafe('OCR dependencies unavailable', { error: errorMessage(error) });
    return {
      result: {
        text: '',
        pagesProcessed: 0,
        pagesAvailable: 0,
        confidence: 0,
        timings: { render_ms: 0, recognize_ms: 0 },
        used: false,
        reason: 'OCR runtime dependencies could not be loaded in this environment.',
      },
      complexity: emptyComplexity,
    };
  }

  const documentTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  const texts: string[] = [];
  const confidences: number[] = [];
  let pagesAvailable = 0;
  let renderMs = 0;
  let recognizeMs = 0;
  let recognizer: Awaited<ReturnType<NonNullable<OcrOptions['recognizerFactory']>>> | null = null;

  try {
    const document = await documentTask.promise;
    pagesAvailable = document.numPages;
    const pagesToProcess = Math.min(maxPages, pagesAvailable);

    const createRecognizer =
      options.recognizerFactory ??
      (async (language: string) =>
        tesseract.createWorker(language, undefined, {
          // Keep logs quiet; tesseract writes a lot to stdout otherwise.
          logger: () => undefined,
        }));

    recognizer = await createRecognizer(OCR_LANG);

    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });

      const canvas = canvasModule.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      // White background: PDF pages are transparent by default.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      const renderStart = Date.now();
      await page.render({
        canvasContext: context as unknown,
        viewport,
      } as unknown as Parameters<typeof page.render>[0]);
      renderMs += Date.now() - renderStart;

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      toGrayscale(image.data);
      const { histogram, total } = buildHistogram(image.data);
      const threshold = otsuThreshold(histogram, total);
      binarize(image.data, threshold);
      context.putImageData(image, 0, 0);

      const png = canvas.toBuffer('image/png');

      const recognizeStart = Date.now();
      const { data } = await recognizer.recognize(png);
      recognizeMs += Date.now() - recognizeStart;

      texts.push(data.text ?? '');
      confidences.push(data.confidence ?? 0);

      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }

    await document.destroy();

    const averageConfidence =
      confidences.length > 0
        ? confidences.reduce((total, value) => total + value, 0) / confidences.length
        : 0;

    return {
      result: {
        text: normalizeOcrText(texts.join('\n\n')),
        pagesProcessed: pagesToProcess,
        pagesAvailable,
        confidence: Math.round(averageConfidence * 100) / 100,
        timings: { render_ms: renderMs, recognize_ms: recognizeMs },
        used: true,
      },
      complexity: {
        page_count: pagesAvailable,
        images_detected: pagesAvailable,
      },
    };
  } catch (error) {
    logSafe('OCR failed', { error: errorMessage(error), elapsed_ms: Date.now() - startedAt });
    return {
      result: {
        text: '',
        pagesProcessed: texts.length,
        pagesAvailable,
        confidence: 0,
        timings: { render_ms: renderMs, recognize_ms: recognizeMs },
        used: false,
        reason: 'Optical character recognition could not read this document.',
      },
      complexity: emptyComplexity,
    };
  } finally {
    if (recognizer) {
      try {
        await recognizer.terminate();
      } catch {
        // Termination failures are not actionable.
      }
    }
    try {
      await documentTask.destroy();
    } catch {
      // Already destroyed.
    }
  }
}

/** OCR output arrives with hyphenation and stray newlines; tidy it deterministically. */
export function normalizeOcrText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    // Re-join words split across a line break by a hyphen.
    .replace(/([A-Za-z])-\n([a-z])/g, '$1$2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/\s{2,}/g, '  ').trim())
    .join('\n')
    .trim();
}

/** Typed error used when OCR is required but unavailable. */
export function ocrUnavailableError(): AppError {
  return new AppError('OCR fallback did not produce usable text', {
    status: 422,
    code: 'UNPROCESSABLE_ENTITY',
    userMessage:
      'This PDF appears to be a scan or an image-only export, and we could not read enough text from it. Please upload a text-based PDF or the original DOCX file.',
  });
}
