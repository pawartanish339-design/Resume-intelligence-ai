import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Runtime loaders for pdfjs + canvas.
 *
 * Both are CommonJS/ESM hybrids with native or generated worker assets, so they are
 * loaded dynamically from the Node.js runtime instead of being bundled. Keeping the
 * loading logic here means the parser and the OCR path agree on worker configuration,
 * and tests can stub a single module.
 */

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type CanvasModule = typeof import('@napi-rs/canvas');

/**
 * Absolute file URL of pdfjs's fake-worker bundle.
 *
 * pdfjs (in Node) loads the worker through a runtime `import()` of
 * `GlobalWorkerOptions.workerSrc`, which otherwise defaults to the *relative*
 * "./pdf.worker.mjs". Inside a bundled server runtime that specifier resolves against
 * the emitted chunk, so it must be replaced with an absolute URL.
 *
 * The path is probed with `existsSync` rather than `require.resolve` on purpose: a
 * non-literal `require`/`require.resolve` makes the bundler emit a "critical dependency"
 * warning, and a literal ESM specifier makes it fail outright. The worker asset itself is
 * traced into the deployment by `outputFileTracingIncludes` in next.config.mjs.
 */
function resolveWorkerUrl(): string | null {
  const relative = path.join('node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
  const candidate = path.join(process.cwd(), relative);

  return existsSync(candidate) ? pathToFileURL(candidate).href : null;
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;
let canvasPromise: Promise<CanvasModule> | null = null;

export async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const mod = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfJsModule;

      const workerUrl = resolveWorkerUrl();
      if (workerUrl) {
        (mod.GlobalWorkerOptions as { workerSrc: string }).workerSrc = workerUrl;
      }

      return mod;
    })();
  }
  return pdfjsPromise;
}

export async function loadCanvas(): Promise<CanvasModule> {
  if (!canvasPromise) {
    canvasPromise = import('@napi-rs/canvas') as Promise<CanvasModule>;
  }
  return canvasPromise;
}

/** Test helper. */
export function resetPdfRuntimeCache(): void {
  pdfjsPromise = null;
  canvasPromise = null;
}
