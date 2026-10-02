import { describe, expect, it } from 'vitest';

import { extractPdfText, hasPdfMagicBytes } from '@/lib/services/parser';
import { AppError } from '@/lib/utils/errors';

/**
 * Real-PDF coverage for the parser.
 *
 * The document below is assembled byte-by-byte (valid xref table included) so the
 * suite exercises the actual pdfjs worker resolution and text extraction without any
 * fixture files or network access.
 */

interface Line {
  x: number;
  y: number;
  text: string;
}

function buildPdf(lines: Line[]): Buffer {
  const content = ['BT', '/F1 11 Tf', '14 TL'];
  for (const line of lines) {
    content.push(`1 0 0 1 ${line.x} ${line.y} Tm`);
    content.push(`(${line.text.replace(/([()\\])/g, '\\$1')}) Tj`);
  }
  content.push('ET');

  const stream = Buffer.from(content.join('\n'), 'latin1');

  const bodies: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from('\nendstream'),
    ]),
  ];

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let length = chunks[0]?.length ?? 0;

  bodies.forEach((body, index) => {
    const head = Buffer.from(`${index + 1} 0 obj\n`);
    const tail = Buffer.from('\nendobj\n');
    offsets.push(length);
    chunks.push(head, body, tail);
    length += head.length + body.length + tail.length;
  });

  const xrefOffset = length;
  const xref = [`xref\n0 ${bodies.length + 1}\n`, '0000000000 65535 f \n'];
  for (const offset of offsets) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const trailer = Buffer.from(xref.join(''), 'latin1');
  chunks.push(trailer);

  return Buffer.concat(chunks);
}

const RESUME_PDF = buildPdf([
  { x: 72, y: 720, text: 'Dana Example' },
  { x: 72, y: 700, text: 'Senior Backend Engineer' },
  { x: 72, y: 680, text: 'dana@example.com | (415) 555-0100 | Austin, TX' },
  { x: 72, y: 650, text: 'Experience' },
  { x: 72, y: 632, text: 'Northwind Payments - Senior Backend Engineer' },
  { x: 72, y: 614, text: 'Rebuilt the billing dashboard in TypeScript, cutting page load time by 42 percent.' },
  { x: 72, y: 596, text: 'Modelled the double-entry ledger schema in PostgreSQL with sixteen tables.' },
  { x: 72, y: 568, text: 'Skills' },
  { x: 72, y: 550, text: 'TypeScript, Python, PostgreSQL, Docker, Kubernetes, Redis, SQL' },
]);

/** Bytes that look like a PDF but have no parsable structure. */
const BROKEN_PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('not a real document'.repeat(40))]);

describe('extractPdfText on a well-formed document', () => {
  it('extracts the text through the real pdfjs worker', async () => {
    expect(hasPdfMagicBytes(RESUME_PDF)).toBe(true);

    const outcome = await extractPdfText(RESUME_PDF);

    expect(outcome.text).toContain('Dana Example');
    expect(outcome.text).toContain('Northwind Payments');
    expect(outcome.text).toContain('PostgreSQL with sixteen tables');
    expect(outcome.text).toContain('TypeScript, Python, PostgreSQL');
    expect(outcome.complexity.page_count).toBe(1);
    expect(outcome.complexity.fonts).toContain('Helvetica');
    expect(outcome.charCountByPage[0]).toBeGreaterThan(200);
  });

  it('does not invent layout findings for a single-column page', async () => {
    const outcome = await extractPdfText(RESUME_PDF);

    expect(outcome.complexity.columns_detected).toBe(0);
    expect(outcome.complexity.tables_detected).toBe(0);
  });
});

describe('extractPdfText fallback for files pdfjs cannot open', () => {
  it('recovers text with the legacy reader and reports the missing layout metadata', async () => {
    const calls: Buffer[] = [];

    const outcome = await extractPdfText(BROKEN_PDF, {
      textFallback: async (buffer) => {
        calls.push(buffer);
        return { text: 'Recovered resume text\nTypeScript and PostgreSQL experience.', numpages: 2 };
      },
    });

    expect(calls).toHaveLength(1);
    expect(outcome.text).toContain('Recovered resume text');
    expect(outcome.complexity.page_count).toBe(2);
    // Layout detail is unknown, so it must be empty rather than guessed.
    expect(outcome.complexity.fonts).toEqual([]);
    expect(outcome.complexity.tables_detected).toBe(0);
    expect(outcome.links).toEqual([]);
    expect(outcome.warnings.join(' ')).toMatch(/legacy reader/i);
  });

  it('still returns a typed 422 when the legacy reader also fails', async () => {
    await expect(
      extractPdfText(BROKEN_PDF, {
        textFallback: async () => {
          throw new Error('legacy reader cant parse this either');
        },
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('refuses an empty recovery instead of returning a blank document', async () => {
    await expect(
      extractPdfText(BROKEN_PDF, {
        textFallback: async () => ({ text: '   \n  ', numpages: 1 }),
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
