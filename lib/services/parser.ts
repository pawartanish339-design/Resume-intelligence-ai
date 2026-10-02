import { createHash } from 'node:crypto';
import JSZip from 'jszip';

import { AppError, logSafe, errorMessage } from '@/lib/utils/errors';
import { assessExtractionQuality } from '@/lib/services/extraction-quality';
import { loadPdfJs } from '@/lib/services/pdf-runtime';
import { ocrPdf } from '@/lib/services/ocr';
import type {
  DocumentComplexityMetrics,
  ExtractionMethod,
  FileValidationResult,
  ParsedDocument,
} from '@/types/resume';

/**
 * Deterministic document parsing.
 *
 * Responsibilities:
 *   - strict file validation (size, extension, magic bytes, filename sanitation)
 *   - PDF text extraction in *reading order* (multi-column aware, header/footer free)
 *   - DOCX extraction that keeps tables and links readable (mammoth + raw OOXML scan)
 *   - quality verification with an OCR fallback for scanned PDFs
 *
 * Everything here is synchronous-ish CPU work with no AI involvement, which is what
 * makes the downstream scores reproducible.
 */

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_FILENAME_LENGTH = 120;

const PDF_MAGIC = '%PDF-';
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"

export const SUPPORTED_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
} as const;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Strip directories, control characters, and dangerous extensions. */
export function sanitizeFilename(raw: string): string {
  const base = (raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop() ?? '';

  const stripped = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\w\s.\-()+&']/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  const safe = stripped.length > 0 ? stripped : 'resume';
  if (safe.length <= MAX_FILENAME_LENGTH) return safe;

  const dotIndex = safe.lastIndexOf('.');
  const extension = dotIndex > 0 ? safe.slice(dotIndex) : '';
  return `${safe.slice(0, MAX_FILENAME_LENGTH - extension.length)}${extension}`;
}

export function hasPdfMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < PDF_MAGIC.length) return false;
  return buffer.subarray(0, PDF_MAGIC.length).toString('latin1') === PDF_MAGIC;
}

export function hasZipMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < ZIP_MAGIC.length) return false;
  return ZIP_MAGIC.every((byte, index) => buffer[index] === byte);
}

/** DOCX files are ZIPs; the tell-tale part is word/document.xml. */
export async function isDocxArchive(buffer: Buffer): Promise<boolean> {
  if (!hasZipMagicBytes(buffer)) return false;
  try {
    const zip = await JSZip.loadAsync(buffer);
    return Boolean(zip.file('word/document.xml')) || Boolean(zip.file('[Content_Types].xml'));
  } catch {
    return false;
  }
}

/**
 * Validate an upload. Throws typed AppErrors so routes can answer 400/413/415
 * without leaking stack traces.
 */
export async function validateUploadedFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType?: string | null,
): Promise<FileValidationResult> {
  if (!buffer || buffer.length === 0) {
    throw new AppError('Uploaded file is empty', {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage: 'That file is empty. Please upload a resume PDF or DOCX with content.',
    });
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new AppError(`File exceeds ${MAX_FILE_SIZE_BYTES} bytes`, {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      userMessage: 'The uploaded file exceeds the 10 MB limit. Please compress it and try again.',
    });
  }

  const sanitizedFilename = sanitizeFilename(filename);
  const lower = sanitizedFilename.toLowerCase();
  const extensionFromName = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.docx') ? 'docx' : null;

  const isPdf = hasPdfMagicBytes(buffer);
  const isDocx = await isDocxArchive(buffer);

  if (!isPdf && !isDocx) {
    throw new AppError('Unrecognised file signature', {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      userMessage:
        'We could not verify this file type. Upload a PDF (.pdf) or Word document (.docx).',
      logContext: { declaredMimeType, filename: sanitizedFilename },
    });
  }

  // Extension/content mismatch: reject rather than guess.
  if (extensionFromName === 'pdf' && !isPdf) {
    throw new AppError('Extension/content mismatch (expected PDF)', {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      userMessage: 'That file is named .pdf but its contents are not a PDF. Please re-export and upload again.',
    });
  }

  if (extensionFromName === 'docx' && !isDocx) {
    throw new AppError('Extension/content mismatch (expected DOCX)', {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      userMessage:
        'That file is named .docx but its contents are not a Word document. Please re-export and upload again.',
    });
  }

  if (!extensionFromName && isDocx) {
    throw new AppError('Legacy .doc files are not supported', {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      userMessage: 'Legacy .doc files are not supported. Save the document as .docx and upload again.',
    });
  }

  const extension: 'pdf' | 'docx' = isPdf ? 'pdf' : 'docx';

  return {
    ok: true,
    extension,
    mimeType: extension === 'pdf' ? SUPPORTED_MIME_TYPES.pdf : SUPPORTED_MIME_TYPES.docx,
    sanitizedFilename: ensureExtension(sanitizedFilename, extension),
    sizeBytes: buffer.length,
    contentHash: createHash('sha256').update(buffer).digest('hex'),
  };
}

function ensureExtension(filename: string, extension: 'pdf' | 'docx'): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(`.${extension}`)) return filename;
  const withoutExtension = filename.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  return `${withoutExtension}.${extension}`;
}

// ---------------------------------------------------------------------------
// Layout primitives (exported for unit tests with synthetic coordinates)
// ---------------------------------------------------------------------------

export interface PositionedItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
}

export interface PageLine {
  text: string;
  x: number;
  right: number;
  y: number;
  items: PositionedItem[];
}

export interface TextColumnSplit {
  splitX: number;
  leftCount: number;
  rightCount: number;
}

export interface ItemColumnSplit extends TextColumnSplit {
  /** Vertical extent of each column as a share of page height (0..1). */
  leftSpan: number;
  rightSpan: number;
  gapWidth: number;
}

const COLUMN_X_CLUSTER_TOLERANCE = 12;

/** Group positioned items into visual lines by their baseline y (tolerant to 3pt). */
export function groupIntoLines(items: PositionedItem[], tolerance = 3): PageLine[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => (Math.abs(b.y - a.y) > tolerance ? b.y - a.y : a.x - b.x));
  const lines: Array<{ y: number; items: PositionedItem[] }> = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - item.y) <= tolerance) {
      current.items.push(item);
      continue;
    }
    lines.push({ y: item.y, items: [item] });
  }

  return lines.map((line) => {
    const ordered = [...line.items].sort((a, b) => a.x - b.x);
    const text = joinLineItems(ordered);
    const x = Math.min(...ordered.map((item) => item.x));
    const right = Math.max(...ordered.map((item) => item.x + item.width));
    return {
      text,
      x,
      right,
      y: line.y,
      items: ordered,
    };
  });
}

/**
 * Join items on one line, inserting a space only where the horizontal gap
 * suggests a word break (PDF text items frequently split mid-word).
 */
export function joinLineItems(items: PositionedItem[]): string {
  let result = '';
  let previousEnd: number | null = null;

  for (const item of items) {
    const text = item.text;
    if (previousEnd !== null) {
      const gap = item.x - previousEnd;
      const averageCharWidth = item.width / Math.max(1, text.length);
      if (gap > Math.max(1.2, averageCharWidth * 0.4) && !/\s$/.test(result) && !/^\s/.test(text)) {
        result += ' ';
      }
    }
    result += text;
    previousEnd = item.x + item.width;
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Detect a two-column layout from raw text-item x positions.
 *
 * Items are clustered by their start x, then adjacent clusters are considered as a
 * column pair when the horizontal gap between them exceeds 15% of the page width
 * and both clusters carry substantial vertical content. This runs on items (not
 * lines) because in a genuine two-column resume, left and right items frequently
 * share the same baseline and would otherwise merge into one "line".
 */
export function detectColumnSplitFromItems(
  items: PositionedItem[],
  pageWidth: number,
  pageHeight: number,
): ItemColumnSplit | null {
  const usable = items.filter((item) => item.text.trim().length > 0);
  if (usable.length < 12 || pageWidth <= 0 || pageHeight <= 0) return null;

  const sorted = [...usable].sort((a, b) => a.x - b.x);
  const clusters: Array<{ minX: number; maxRight: number; items: PositionedItem[] }> = [];

  for (const item of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && item.x - last.minX <= COLUMN_X_CLUSTER_TOLERANCE) {
      last.items.push(item);
      last.maxRight = Math.max(last.maxRight, item.x + item.width);
      continue;
    }
    clusters.push({ minX: item.x, maxRight: item.x + item.width, items: [item] });
  }

  if (clusters.length < 2) return null;

  const verticalSpan = (subset: PositionedItem[]): number => {
    const ys = subset.map((item) => item.y);
    return (Math.max(...ys) - Math.min(...ys)) / pageHeight;
  };

  const gapThreshold = pageWidth * 0.15;
  const narrowGapThreshold = pageWidth * 0.04;

  /**
   * Median right edge. A single long line (the classic full-width name/contact
   * header) must not be allowed to bridge the gutter and hide a real column split,
   * so we use a robust statistic instead of the maximum.
   */
  const typicalRight = (subset: PositionedItem[]): number => {
    const edges = subset.map((item) => item.x + item.width).sort((a, b) => a - b);
    return edges[Math.floor(edges.length / 2)] ?? 0;
  };

  let best: ItemColumnSplit | null = null;
  let bestScore = 0;

  for (let index = 0; index < clusters.length - 1; index += 1) {
    const left = clusters[index] as { minX: number; maxRight: number; items: PositionedItem[] };
    const right = clusters[index + 1] as { minX: number; maxRight: number; items: PositionedItem[] };

    if (left.items.length < 4 || right.items.length < 4) continue;

    const leftEdge = typicalRight(left.items);
    const gap = right.minX - leftEdge;
    if (gap <= narrowGapThreshold) continue;

    const splitX = (leftEdge + right.minX) / 2;

    // Items that span the gutter are full-width blocks (headers, banners). A few
    // are expected; a majority means this is a single-column document.
    const crossing = usable.filter((item) => item.x < splitX - 2 && item.x + item.width > splitX + 2);
    if (crossing.length > Math.max(2, usable.length * 0.2)) continue;

    const leftSpan = verticalSpan(left.items);
    const rightSpan = verticalSpan(right.items);

    // Primary rule (>15% gutter): moderate content requirements.
    const primary = gap > gapThreshold && leftSpan >= 0.25 && rightSpan >= 0.25;

    // Secondary rule (narrow gutter, typical of designed two-column resumes):
    // demands that both clusters carry a large share of the page's content and
    // sit in opposite halves of the page, which right-aligned dates never do.
    const shareThreshold = usable.length * 0.25;
    const secondary =
      !primary &&
      left.items.length >= shareThreshold &&
      right.items.length >= shareThreshold &&
      leftSpan >= 0.2 &&
      rightSpan >= 0.2 &&
      leftEdge < pageWidth * 0.55 &&
      right.minX > pageWidth * 0.45;

    if (!primary && !secondary) continue;

    const score = gap * Math.min(left.items.length, right.items.length) * (primary ? 2 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = {
        splitX,
        leftCount: left.items.length,
        rightCount: right.items.length,
        leftSpan,
        rightSpan,
        gapWidth: gap,
      };
    }
  }

  return best;
}

/** Split items into left column, right column, and full-width (spanning) content. */
export function assignItemsToColumns(
  items: PositionedItem[],
  splitX: number,
): { left: PositionedItem[]; right: PositionedItem[]; spanning: PositionedItem[] } {
  const left: PositionedItem[] = [];
  const right: PositionedItem[] = [];
  const spanning: PositionedItem[] = [];

  for (const item of items) {
    const rightEdge = item.x + item.width;
    if (item.x < splitX - 2 && rightEdge > splitX + 2) {
      spanning.push(item);
    } else if (item.x >= splitX - 2) {
      right.push(item);
    } else {
      left.push(item);
    }
  }

  return { left, right, spanning };
}

/**
 * Reading order for one page of items: full-width blocks (headings, summary
 * banners) first top-to-bottom, then the left column, then the right column.
 */
export function orderItemsForReading(
  items: PositionedItem[],
  pageWidth: number,
  pageHeight: number,
): { lines: PageLine[]; split: ItemColumnSplit | null } {
  const split = detectColumnSplitFromItems(items, pageWidth, pageHeight);
  const byY = (a: PageLine, b: PageLine) => b.y - a.y;

  if (!split) {
    return { lines: groupIntoLines(items).sort(byY), split: null };
  }

  const { left, right, spanning } = assignItemsToColumns(items, split.splitX);

  return {
    lines: [
      ...groupIntoLines(spanning).sort(byY),
      ...groupIntoLines(left).sort(byY),
      ...groupIntoLines(right).sort(byY),
    ],
    split,
  };
}

/**
 * Line-based column heuristic, kept as a secondary signal (and for unit tests with
 * synthetic lines). The pipeline uses `detectColumnSplitFromItems`.
 */
export function detectColumnSplit(lines: PageLine[], pageWidth: number): TextColumnSplit | null {
  if (lines.length < 6 || pageWidth <= 0) return null;

  const gapThreshold = pageWidth * 0.15;
  const candidates: number[] = [];

  for (const left of lines) {
    for (const right of lines) {
      if (right.x <= left.right) continue;
      const gap = right.x - left.right;
      if (gap <= gapThreshold) continue;
      // Neither line may cross the other's span.
      const splitX = (left.right + right.x) / 2;
      const crosses = lines.some((line) => line.x < splitX - 2 && line.right > splitX + 2);
      if (!crosses) candidates.push(splitX);
    }
  }

  if (candidates.length === 0) return null;

  // Use the median candidate for stability against a single odd line.
  candidates.sort((a, b) => a - b);
  const splitX = candidates[Math.floor(candidates.length / 2)] as number;

  const leftLines = lines.filter((line) => line.right <= splitX + 2);
  const rightLines = lines.filter((line) => line.x >= splitX - 2);

  const pageHeight = Math.max(...lines.map((line) => line.y)) - Math.min(...lines.map((line) => line.y));
  const spans = (subset: PageLine[]): number => {
    if (subset.length === 0 || pageHeight <= 0) return 0;
    const ys = subset.map((line) => line.y);
    return (Math.max(...ys) - Math.min(...ys)) / pageHeight;
  };

  if (leftLines.length < 3 || rightLines.length < 3) return null;
  if (spans(leftLines) < 0.25 || spans(rightLines) < 0.25) return null;

  return { splitX, leftCount: leftLines.length, rightCount: rightLines.length };
}

/**
 * Reading order for one page: full-width blocks (headers, summary banners) first
 * top to bottom, then the left column, then the right column.
 */
export function orderPageLines(lines: PageLine[], split: TextColumnSplit | null, pageWidth: number): PageLine[] {
  const byY = (a: PageLine, b: PageLine) => b.y - a.y;

  if (!split) return [...lines].sort(byY);

  const fullWidth = lines.filter(
    (line) => line.right > split.splitX + 2 && line.x < split.splitX - 2,
  );
  const left = lines.filter((line) => line.right <= split.splitX + 2);
  const right = lines.filter((line) => line.x >= split.splitX - 2);

  const fullWidthThreshold = pageWidth * 0.7;
  const spanning = fullWidth.filter((line) => line.right - line.x >= fullWidthThreshold);
  const spanningSet = new Set(spanning);
  const remainingFullWidth = fullWidth.filter((line) => !spanningSet.has(line));

  return [
    ...spanning.sort(byY),
    ...left.sort(byY),
    ...remainingFullWidth.sort(byY),
    ...right.sort(byY),
  ];
}

/** Normalised text used to spot lines that repeat across pages. */
export function normalizeForRepeatDetection(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^a-z#\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PageWithLines {
  pageNumber: number;
  pageHeight: number;
  lines: PageLine[];
}

/**
 * Remove headers/footers: lines inside the top/bottom 8% band that repeat on two
 * or more pages (page numbers included, since digits are normalised to '#').
 */
export function stripRepeatingHeaderFooter(
  pages: PageWithLines[],
  bandRatio = 0.08,
): { pages: PageWithLines[]; removed: string[] } {
  if (pages.length < 2) return { pages, removed: [] };

  const occurrences = new Map<string, Set<number>>();

  for (const page of pages) {
    const topBand = page.pageHeight * (1 - bandRatio);
    const bottomBand = page.pageHeight * bandRatio;

    for (const line of page.lines) {
      if (line.y < topBand && line.y > bottomBand) continue;
      const key = normalizeForRepeatDetection(line.text);
      if (key.length < 3) continue;
      const pagesForKey = occurrences.get(key) ?? new Set<number>();
      pagesForKey.add(page.pageNumber);
      occurrences.set(key, pagesForKey);
    }
  }

  const repeating = new Set(
    Array.from(occurrences.entries())
      .filter(([, pageNumbers]) => pageNumbers.size >= 2)
      .map(([key]) => key),
  );

  if (repeating.size === 0) return { pages, removed: [] };

  const removed: string[] = [];
  const cleaned = pages.map((page) => {
    const topBand = page.pageHeight * (1 - bandRatio);
    const bottomBand = page.pageHeight * bandRatio;

    const keep = page.lines.filter((line) => {
      const inBand = line.y >= topBand || line.y <= bottomBand;
      if (!inBand) return true;
      const key = normalizeForRepeatDetection(line.text);
      if (repeating.has(key)) {
        removed.push(line.text);
        return false;
      }
      return true;
    });

    return { ...page, lines: keep };
  });

  return { pages: cleaned, removed: Array.from(new Set(removed)) };
}

// ---------------------------------------------------------------------------
// PDF extraction
// ---------------------------------------------------------------------------

interface PdfExtractionOutcome {
  text: string;
  complexity: DocumentComplexityMetrics;
  links: string[];
  strippedHeaderFooterLines: string[];
  warnings: string[];
  charCountByPage: number[];
}

export interface ExtractPdfOptions {
  /**
   * Last-resort text extractor used only when pdfjs cannot open the document at all.
   * Injected by tests; defaults to the legacy `pdf-parse` reader.
   */
  textFallback?: (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
}

/**
 * Last-resort reader for documents pdfjs rejects outright ("Structure: expected ...").
 * `pdf-parse` (a thin wrapper around an older pdfjs build) tolerates some of those files.
 * It returns text only, so the caller must treat font/table/layout metadata as unknown.
 */
type PdfParseFn = (data: Buffer) => Promise<{ text: string; numpages: number }>;

async function defaultTextFallback(buffer: Buffer): Promise<{ text: string; numpages: number }> {
  // The package is CommonJS-only and untrusted, so both export shapes are handled.
  const mod = (await import('pdf-parse')) as unknown as PdfParseFn | { default?: PdfParseFn };

  const parse = typeof mod === 'function' ? mod : mod.default;
  if (typeof parse !== 'function') throw new Error('pdf-parse did not expose a callable export');

  const result = await parse(buffer);
  return { text: result.text ?? '', numpages: result.numpages ?? 1 };
}

export async function extractPdfText(
  buffer: Buffer,
  options: ExtractPdfOptions = {},
): Promise<PdfExtractionOutcome> {
  const pdfjs = await loadPdfJs();
  const warnings: string[] = [];
  const links = new Set<string>();
  const fonts = new Set<string>();
  const nonEmbeddedFonts = new Set<string>();
  const symbolFonts = new Set<string>();

  let imagesDetected = 0;
  let textBoxesDetected = 0;
  let drawingsDetected = 0;
  let columnsDetected = 0;
  let tableRows = 0;

  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  });

  let document: Awaited<typeof task.promise> | null = null;

  try {
    document = await task.promise;
  } catch (error) {
    const message = errorMessage(error);
    logSafe('PDF could not be opened', { error: message });

    if (/password/i.test(message)) {
      throw new AppError('Password-protected PDF', {
        status: 422,
        code: 'UNPROCESSABLE_ENTITY',
        userMessage:
          'This PDF is password protected. Remove the password (or export an unprotected copy) and upload again.',
      });
    }

    // Last resort before failing the upload: the legacy reader recovers some files that
    // pdfjs refuses. The recovered text is subject to the same downstream quality gate,
    // and the missing layout metadata is reported as a warning instead of being faked.
    const fallback = options.textFallback ?? defaultTextFallback;
    try {
      const recovered = await fallback(buffer);
      if (recovered.text.trim().length > 0) {
        warnings.push(
          'The modern PDF reader could not open this file; its text was recovered with the legacy reader, so font, table, and layout details are unavailable.',
        );

        return {
          text: normalizeExtractedText(recovered.text),
          complexity: {
            page_count: recovered.numpages > 0 ? recovered.numpages : 1,
            columns_detected: 0,
            tables_detected: 0,
            table_rows_detected: 0,
            text_boxes_detected: 0,
            drawings_detected: 0,
            images_detected: 0,
            fonts: [],
            non_embedded_fonts: [],
            symbol_fonts: [],
            header_footer_lines_removed: 0,
            link_count: 0,
            docx_columns_detected: false,
          },
          links: [],
          strippedHeaderFooterLines: [],
          warnings,
          charCountByPage: [],
        };
      }
    } catch (fallbackError) {
      logSafe('Legacy PDF reader fallback failed', { error: errorMessage(fallbackError) });
    }

    throw new AppError(`Corrupt or unreadable PDF: ${message}`, {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage:
        'We could not open this PDF — it may be corrupted. Try re-exporting it, or upload the DOCX version.',
    });
  }

  const pagesWithLines: PageWithLines[] = [];
  const charCountByPage: number[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const annotations = await page.getAnnotations();

      const items: PositionedItem[] = [];
      for (const rawItem of content.items) {
        const item = rawItem as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string };
        if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
        if (item.str.trim().length === 0) continue;

        items.push({
          text: item.str,
          x: item.transform[4] ?? 0,
          y: item.transform[5] ?? 0,
          width: item.width ?? 0,
          height: item.height ?? Math.abs(item.transform[3] ?? 0),
          fontName: item.fontName ?? 'unknown',
        });
      }

      // Annotated links -> append the URL after the anchor text.
      const linkTargets = annotations.filter(
        (annotation) => typeof annotation.url === 'string' && annotation.url.length > 0,
      );

      for (const annotation of linkTargets) {
        const url = annotation.url as string;
        links.add(url);
        const rect = annotation.rect ?? null;
        if (!rect || rect.length < 4) continue;

        const [x1, y1, x2, y2] = rect as [number, number, number, number];
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        const anchored = items.filter((item) => {
          const itemRight = item.x + item.width;
          const itemTop = item.y + item.height;
          return item.x <= maxX && itemRight >= minX && item.y <= maxY && itemTop >= minY;
        });

        if (anchored.length > 0) {
          const last = anchored[anchored.length - 1] as PositionedItem;
          last.text = `${last.text} (${url})`;
        }
      }

      // Fonts + images + drawings from the operator list (best effort).
      try {
        const operatorList = await page.getOperatorList();
        const ops = pdfjs.OPS as Record<string, number>;

        const isKind = (fn: number, names: string[]): boolean =>
          names.some((name) => typeof ops[name] === 'number' && ops[name] === fn);

        for (const fn of operatorList.fnArray) {
          if (isKind(fn, ['paintImageXObject', 'paintImageXObjectRepeat', 'paintJpegXObject', 'paintImageMaskXObject', 'paintInlineImageXObject'])) {
            imagesDetected += 1;
          } else if (isKind(fn, ['constructPath'])) {
            drawingsDetected += 1;
          }
        }

        for (let index = 0; index < operatorList.fnArray.length; index += 1) {
          const fn = operatorList.fnArray[index];
          if (isKind(fn, ['setFont'])) {
            const args = operatorList.argsArray[index] as unknown[];
            const fontRef = args?.[0];
            const fontName = resolveFontName(page, fontRef);
            if (fontName) registerFont(fontName, fonts, nonEmbeddedFonts, symbolFonts);
          }
        }
      } catch {
        // Operator list is optional: never fail a parse because of it.
      }

      for (const style of Object.values(content.styles ?? {})) {
        const family = (style as { fontFamily?: string }).fontFamily;
        if (family) registerFont(family, fonts, nonEmbeddedFonts, symbolFonts);
      }

      const lines = groupIntoLines(items);
      const ordered = orderItemsForReading(items, viewport.width, viewport.height);
      if (ordered.split) columnsDetected += 1;

      tableRows += countLikelyTableRows(lines);

      const pageHeight = viewport.height;
      const charCount = lines.reduce((total, line) => total + line.text.length, 0);
      charCountByPage.push(charCount);

      pagesWithLines.push({ pageNumber, pageHeight, lines: ordered.lines });
    }
  } finally {
    try {
      await document?.destroy();
    } catch {
      // nothing actionable
    }
    try {
      await task.destroy();
    } catch {
      // nothing actionable
    }
  }

  const stripped = stripRepeatingHeaderFooter(pagesWithLines);
  if (stripped.removed.length > 0) {
    warnings.push(
      `Removed ${stripped.removed.length} repeating header/footer line(s) that appeared on multiple pages.`,
    );
  }

  const text = stripped.pages
    .map((page) => page.lines.map((line) => line.text).join('\n'))
    .join('\n\n');

  if (charCountByPage.some((count) => count === 0)) {
    warnings.push('One or more PDF pages contained no extractable text (possibly scanned images).');
  }

  return {
    text: normalizeExtractedText(text),
    complexity: {
      page_count: document.numPages,
      columns_detected: columnsDetected,
      tables_detected: tableRows > 0 ? Math.max(1, Math.floor(tableRows / 4)) : 0,
      table_rows_detected: tableRows,
      text_boxes_detected: textBoxesDetected,
      drawings_detected: drawingsDetected,
      images_detected: imagesDetected,
      fonts: Array.from(fonts),
      non_embedded_fonts: Array.from(nonEmbeddedFonts),
      symbol_fonts: Array.from(symbolFonts),
      header_footer_lines_removed: stripped.removed.length,
      link_count: links.size,
      docx_columns_detected: false,
    },
    links: Array.from(links),
    strippedHeaderFooterLines: stripped.removed,
    warnings,
    charCountByPage,
  };
}

function resolveFontName(page: unknown, fontRef: unknown): string | null {
  // `commonObjs` is not part of the public typings; access defensively.
  try {
    const commonObjs = (page as { commonObjs?: { has?: (id: string) => boolean; get?: (id: string) => unknown } })
      .commonObjs;
    if (commonObjs && typeof commonObjs.has === 'function' && typeof commonObjs.get === 'function') {
      const ref = fontRef as { name?: string; id?: string } | string;
      const id = typeof ref === 'string' ? ref : ref?.name ?? ref?.id;
      if (id && commonObjs.has(id)) {
        const font = commonObjs.get(id) as { name?: string; loadedName?: string } | null;
        return font?.name ?? font?.loadedName ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

const STANDARD_FONTS = [
  'arial', 'helvetica', 'times', 'courier', 'calibri', 'cambria', 'georgia', 'garamond',
  'verdana', 'tahoma', 'trebuchet', 'liberation', 'dejavu', 'roboto', 'lato', 'open sans',
  'source sans', 'noto', 'pt sans', 'franklin', 'book antiqua', 'palatino', 'consolas',
  'menlo', 'monaco', 'segoe', 'ubuntu', 'futura', 'gill sans', 'arial narrow', 'carlito',
];

const SYMBOL_FONTS = ['symbol', 'zapfdingbats', 'dingbats', 'wingdings', 'mt extra', 'cmmi', 'cmsy', 'cmex', 'cmr'];

function registerFont(
  rawName: string,
  all: Set<string>,
  nonEmbedded: Set<string>,
  symbols: Set<string>,
): void {
  const name = (rawName ?? '').trim();
  if (!name) return;
  if (name === 'sans-serif' || name === 'serif' || name === 'monospace') return;

  all.add(name);
  const lower = name.toLowerCase();

  if (SYMBOL_FONTS.some((needle) => lower.includes(needle))) {
    symbols.add(name);
    return;
  }

  const isSubset = /^[A-Z]{6}\+/.test(name); // e.g. "ABCDEF+Calibri"
  const isStandard = STANDARD_FONTS.some((needle) => lower.includes(needle));
  if (!isSubset && !isStandard) nonEmbedded.add(name);
}

/** Heuristic: 3+ lines on one page aligned into two or more wide horizontal runs. */
function countLikelyTableRows(lines: PageLine[]): number {
  let rows = 0;
  for (const line of lines) {
    const occurrences = (line.text.match(/\s{3,}/g) ?? []).length;
    const hasSeparators = /[|•·]/.test(line.text);
    if (occurrences >= 2 || (hasSeparators && occurrences >= 1)) rows += 1;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// DOCX extraction
// ---------------------------------------------------------------------------

export interface DocxExtractionOutcome {
  text: string;
  complexity: DocumentComplexityMetrics;
  links: string[];
  warnings: string[];
}

export async function extractDocxText(buffer: Buffer): Promise<DocxExtractionOutcome> {
  const warnings: string[] = [];
  const links = new Set<string>();
  const fonts = new Set<string>();
  const nonEmbeddedFonts = new Set<string>();

  let html = '';
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value ?? '';
    for (const message of result.messages ?? []) {
      if (message.type === 'warning') warnings.push(`DOCX: ${message.message}`);
    }
  } catch (error) {
    throw new AppError(`DOCX could not be converted: ${errorMessage(error)}`, {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage:
        'We could not read this Word document. Try re-saving it as .docx (not .doc) and upload again.',
    });
  }

  let tablesDetected = 0;
  let tableRows = 0;
  let textBoxesDetected = 0;
  let drawingsDetected = 0;
  let docxColumnsDetected = false;

  try {
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = (await zip.file('word/document.xml')?.async('string')) ?? '';

    tablesDetected = (documentXml.match(/<w:tbl[ >]/g) ?? []).length;
    tableRows = (documentXml.match(/<w:tr[ >]/g) ?? []).length;
    textBoxesDetected =
      (documentXml.match(/<w:txbxContent[ >]/g) ?? []).length +
      (documentXml.match(/<w:pict[ >]/g) ?? []).length;
    drawingsDetected = (documentXml.match(/<w:drawing[ >]/g) ?? []).length;
    docxColumnsDetected = /<w:cols[^>]*w:num="[2-9]/.test(documentXml);

    for (const match of documentXml.matchAll(/<w:rFonts[^>]*w:ascii="([^"]+)"/g)) {
      const font = match[1];
      if (font) {
        fonts.add(font);
        if (!STANDARD_FONTS.some((needle) => font.toLowerCase().includes(needle))) {
          nonEmbeddedFonts.add(font);
        }
      }
    }
  } catch (error) {
    warnings.push(`DOCX structural scan skipped: ${errorMessage(error)}`);
  }

  const converted = convertHtmlToText(html);
  for (const link of converted.links) links.add(link);

  const text = normalizeExtractedText(converted.text);

  return {
    text,
    complexity: {
      page_count: estimateDocxPages(text),
      columns_detected: docxColumnsDetected ? 2 : 0,
      tables_detected: tablesDetected,
      table_rows_detected: tableRows,
      text_boxes_detected: textBoxesDetected,
      drawings_detected: drawingsDetected,
      images_detected: drawingsDetected,
      fonts: Array.from(fonts),
      non_embedded_fonts: Array.from(nonEmbeddedFonts),
      symbol_fonts: [],
      header_footer_lines_removed: 0,
      link_count: links.size,
      docx_columns_detected: docxColumnsDetected,
    },
    links: Array.from(links),
    warnings,
  };
}

function estimateDocxPages(text: string): number {
  const charactersPerPage = 3_000;
  return Math.max(1, Math.ceil(text.length / charactersPerPage));
}

export interface HtmlConversion {
  text: string;
  links: string[];
}

/**
 * Convert mammoth's HTML into linear text:
 *   - `<table>` becomes Markdown-style rows so the content survives
 *   - `<a href>` becomes "anchor text (url)"
 *   - block elements become newlines
 */
export function convertHtmlToText(html: string): HtmlConversion {
  const links: string[] = [];

  let working = html;

  // Anchors first so their text and target survive tag stripping.
  working = working.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, anchorHtml: string) => {
      const anchorText = stripTags(anchorHtml).trim();
      const url = decodeHtmlEntities(href).trim();
      if (!url) return anchorText;
      if (url.startsWith('http')) links.push(url);
      return anchorText ? `${anchorText} (${url})` : url;
    },
  );

  // Tables -> | cell | cell |
  working = working
    .replace(/<tr\b[^>]*>/gi, '\n| ')
    .replace(/<\/tr>/gi, ' |')
    .replace(/<\/t[dh]>\s*<t[dh]\b[^>]*>/gi, ' | ')
    .replace(/<\/?t(?:able|head|body|foot)\b[^>]*>/gi, '\n');

  working = working
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|section|article)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ');

  const withoutTags = stripTags(working);

  const text = decodeHtmlEntities(withoutTags)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return { text, links };
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '-',
  mdash: '-',
  hellip: '...',
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
  bull: '•',
  middot: '·',
  copy: '(c)',
  reg: '(R)',
  trade: '(TM)',
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? match);
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

/** Typographic normalisation that preserves meaning (never rewrites wording). */
export function normalizeExtractedText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2022\u25CF\u25AA\u25E6\u2043\u2219]/g, '•')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface ExtractDocumentOptions {
  /** Force-disable the OCR path (tests, or when the operator opts out). */
  allowOcr?: boolean;
  /** Injected OCR implementation for tests. */
  ocr?: typeof ocrPdf;
}

/**
 * Full parse: validate → extract → verify quality → OCR fallback (PDF only).
 * Returns a ParsedDocument or throws a typed 4xx AppError.
 */
export async function extractDocument(
  buffer: Buffer,
  filename: string,
  mimeType?: string | null,
  options: ExtractDocumentOptions = {},
): Promise<ParsedDocument & { validation: FileValidationResult }> {
  const validation = await validateUploadedFile(buffer, filename, mimeType);
  const allowOcr = options.allowOcr ?? true;

  if (validation.extension === 'docx') {
    const outcome = await extractDocxText(buffer);
    const quality = assessExtractionQuality(outcome.text);

    if (!quality.passed) {
      throw new AppError('DOCX did not yield readable text', {
        status: 422,
        code: 'UNPROCESSABLE_ENTITY',
        userMessage:
          'We could not read enough text from this Word document. If it contains scanned images, export a text-based PDF and upload that instead.',
        logContext: { reasons: quality.reasons },
      });
    }

    return {
      text: outcome.text,
      method: 'docx' satisfies ExtractionMethod,
      complexity: outcome.complexity,
      quality,
      strippedHeaderFooterLines: [],
      links: outcome.links,
      warnings: outcome.warnings,
      raw_text_length: outcome.text.length,
      validation,
    };
  }

  const native = await extractPdfText(buffer);
  const nativeQuality = assessExtractionQuality(native.text);

  if (nativeQuality.passed) {
    return {
      text: native.text,
      method: 'native' satisfies ExtractionMethod,
      complexity: native.complexity,
      quality: nativeQuality,
      strippedHeaderFooterLines: native.strippedHeaderFooterLines,
      links: native.links,
      warnings: native.warnings,
      raw_text_length: native.text.length,
      validation,
    };
  }

  const warnings = [
    ...native.warnings,
    `Native PDF text extraction failed the quality check (${nativeQuality.reasons.join(' ')})`,
  ];

  if (!allowOcr) {
    throw new AppError('PDF requires OCR but OCR is disabled', {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage:
        'This PDF appears to be a scan. Optical character recognition is disabled in this environment, so please upload a text-based PDF or DOCX.',
      logContext: { reasons: nativeQuality.reasons },
    });
  }

  const ocrFn = options.ocr ?? ocrPdf;
  const { result } = await ocrFn(buffer);
  warnings.push(...(result.reason ? [result.reason] : []));

  const ocrQuality = assessExtractionQuality(result.text);

  if (!result.used || !ocrQuality.passed) {
    throw new AppError('Neither native extraction nor OCR produced usable text', {
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      userMessage:
        'We could not read enough text from this document. Please upload a text-based PDF or the original DOCX file — scanned images and heavily designed layouts are not reliably readable.',
      logContext: {
        nativeReasons: nativeQuality.reasons,
        ocrReasons: ocrQuality.reasons,
        ocrPages: result.pagesProcessed,
      },
    });
  }

  warnings.push(
    `Text was recovered with OCR from ${result.pagesProcessed} of ${result.pagesAvailable} page(s) (average confidence ${result.confidence}%). Formatting details such as columns and tables may be less reliable.`,
  );

  return {
    text: result.text,
    method: 'ocr' satisfies ExtractionMethod,
    complexity: {
      ...native.complexity,
      images_detected: Math.max(native.complexity.images_detected, result.pagesProcessed),
    },
    quality: ocrQuality,
    strippedHeaderFooterLines: native.strippedHeaderFooterLines,
    links: native.links,
    warnings,
    raw_text_length: result.text.length,
    validation,
  };
}

/**
 * Build the storage key. The user's own filename is NEVER used as a key: only a
 * random UUID plus the verified extension, namespaced by the owner's id (which is
 * also what the storage RLS policies check).
 */
export function buildStorageKey(userId: string, extension: 'pdf' | 'docx', randomId: string): string {
  const safeExtension = extension === 'pdf' ? 'pdf' : 'docx';
  return `${userId}/${randomId}.${safeExtension}`;
}
