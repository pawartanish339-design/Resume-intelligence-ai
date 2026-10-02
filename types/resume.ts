import type { CanonicalResume, ExtractionQuality } from '@/lib/ai/schemas';

export type ExtractionMethod = 'native' | 'ocr' | 'docx';

/** Structural facts collected while parsing; inputs to the ATS analysis. */
export interface DocumentComplexityMetrics {
  page_count: number;
  columns_detected: number;
  tables_detected: number;
  table_rows_detected: number;
  text_boxes_detected: number;
  drawings_detected: number;
  images_detected: number;
  fonts: string[];
  non_embedded_fonts: string[];
  symbol_fonts: string[];
  header_footer_lines_removed: number;
  link_count: number;
  /** DOCX-only: was the section layout columnar (`w:cols`)? */
  docx_columns_detected: boolean;
}

export interface ParsedDocument {
  /** Cleaned, reading-order text. */
  text: string;
  method: ExtractionMethod;
  complexity: DocumentComplexityMetrics;
  quality: ExtractionQuality;
  /** Text removed because it repeated on >= 2 pages (headers/footers). */
  strippedHeaderFooterLines: string[];
  /** Ordered link targets discovered in the document. */
  links: string[];
  warnings: string[];
  /** Raw byte length of the returned text (pre-normalisation). */
  raw_text_length: number;
}

export interface FileValidationResult {
  ok: true;
  extension: 'pdf' | 'docx';
  mimeType: string;
  sanitizedFilename: string;
  sizeBytes: number;
  /** SHA-256 of the file bytes, used for dedupe + audit (never the content). */
  contentHash: string;
}

export type FileType = 'pdf' | 'docx';

export interface ResumeVersionListItem {
  id: string;
  version_number: number;
  label: string | null;
  raw_text_length: number | null;
  extraction_method: string | null;
  created_at: string;
  /** Optional ATS summary surfaced in the resume hub. */
  ats_score: number | null;
  analysis_count: number;
}

export interface ResumeListItem {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
  versions: ResumeVersionListItem[];
}

export interface ResumeVersionDetail {
  id: string;
  resume_id: string;
  version_number: number;
  label: string | null;
  extracted_data: CanonicalResume;
  raw_text_length: number | null;
  extraction_method: string | null;
  ats_metrics: Record<string, unknown> | null;
  created_at: string;
}
