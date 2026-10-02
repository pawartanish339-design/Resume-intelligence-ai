/**
 * Ambient declarations for dependencies that either ship no types or are imported
 * through deep ESM paths (the pdfjs "legacy" build keeps CommonJS-friendly polyfills
 * and is the only build that runs reliably inside the Node.js runtime).
 */

declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export interface PdfTextItem {
    str: string;
    transform: number[];
    width: number;
    height: number;
    dir?: string;
    fontName?: string;
  }
  export interface PdfTextContent {
    items: Array<PdfTextItem | { type?: string }>;
    styles: Record<string, { fontFamily?: string; ascent?: number; descent?: number }>;
  }
  export interface PdfAnnotationData {
    subtype?: string;
    url?: string;
    rect?: number[];
  }
  export interface PdfPageProxy {
    getViewport(params: { scale: number }): {
      width: number;
      height: number;
      transform: number[];
    };
    getTextContent(params?: Record<string, unknown>): Promise<PdfTextContent>;
    getAnnotations(): Promise<PdfAnnotationData[]>;
    getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    render(params: {
      canvasContext: unknown;
      viewport: { width: number; height: number; transform: number[] };
      background?: string;
    }): { promise: Promise<void>; cancel: () => void };
    cleanup(): void;
  }
  export interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
    getMetadata(): Promise<{ info?: Record<string, unknown>; metadata?: unknown }>;
    destroy(): Promise<void>;
  }
  export interface PdfDocumentLoadingTask {
    promise: Promise<PdfDocumentProxy>;
    destroy(): Promise<void>;
  }
  export function getDocument(src: unknown): PdfDocumentLoadingTask;
  export const OPS: Record<string, number>;
  export const GlobalWorkerOptions: { workerSrc: string };
  export const version: string;
}

declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;
  export default pdfParse;
}

declare module 'tesseract.js' {
  interface RecognizeResult {
    data: { text: string; confidence: number };
  }
  interface Worker {
    recognize(image: unknown): Promise<RecognizeResult>;
    terminate(): Promise<unknown>;
  }
  export function createWorker(
    lang?: string,
    oem?: number,
    options?: Record<string, unknown>,
  ): Promise<Worker>;
  export const OEM: Record<string, number>;
  export const PSM: Record<string, number>;
}
