import type { generateObject } from 'ai';

import {
  applyJdDefaults,
  applyResumeDefaults,
  CanonicalJDSchema,
  CanonicalResumeSchema,
  type CanonicalJD,
  type CanonicalResume,
  type ExtractionValidation,
} from '@/lib/ai/schemas';
import {
  EXTRACTION_SYSTEM_PROMPT,
  JD_EXTRACTION_USER_PROMPT,
  RESUME_EXTRACTION_USER_PROMPT,
} from '@/lib/ai/prompts';
import { sanitizeUntrustedText, validateExtraction, wrapUntrustedContent } from '@/lib/ai/safety';
import { generateStructuredObject } from '@/lib/ai/client';
import { LruCache } from '@/lib/utils/cache';
import { textHash } from '@/lib/utils/hash';
import { maskPII, type PiiMaskOptions } from '@/lib/utils/pii';
import type { LlmCallStats, PromptInjectionNotice } from '@/types/analysis';

/**
 * Bounded LLM extraction.
 *
 * Bounded means: temperature 0, schema-enforced output, input sanitised and
 * delimited, results cached by content hash, and a deterministic validation pass
 * that removes anything not present in the source document.
 */

export interface ExtractionSafetyReport {
  notice: PromptInjectionNotice;
  /** Length of the sanitized prompt payload for observability. */
  sanitized_length: number;
  truncated: boolean;
  removed_control_chars: number;
  removed_zero_width_chars: number;
}

export interface ResumeExtractionResult {
  resume: CanonicalResume;
  validation: ExtractionValidation;
  safety: ExtractionSafetyReport;
  stats: LlmCallStats | null;
  cached: boolean;
}

export interface JdExtractionResult {
  jobDescription: CanonicalJD;
  safety: ExtractionSafetyReport;
  stats: LlmCallStats | null;
  cached: boolean;
}

/** Cache TTL: extraction output is a pure function of the (sanitized) input. */
const EXTRACTION_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const resumeCache = new LruCache<string, ResumeExtractionResult>(200, EXTRACTION_CACHE_TTL_MS);
const jdCache = new LruCache<string, JdExtractionResult>(200, EXTRACTION_CACHE_TTL_MS);

export interface ExtractResumeOptions {
  /** Injectable for tests. */
  generate?: typeof generateObject;
  /** Redact phone/address/social URLs before the text leaves the server. */
  maskPii?: boolean;
  piiOptions?: PiiMaskOptions;
  /** Bypass the in-process cache (used by tests). */
  skipCache?: boolean;
  purpose?: string;
}

function buildSafetyReport(params: {
  sanitized: ReturnType<typeof sanitizeUntrustedText>;
  document: 'resume' | 'job_description';
  maskSummary?: Record<string, number>;
}): ExtractionSafetyReport {
  const matches = [...params.sanitized.matches];
  for (const [category] of Object.entries(params.maskSummary ?? {})) {
    matches.push(`pii_masked:${category}`);
  }

  return {
    notice: {
      flagged: params.sanitized.flagged || Boolean(params.maskSummary && Object.keys(params.maskSummary).length > 0),
      matches: Array.from(new Set(matches)),
      documents: [params.document],
    },
    sanitized_length: params.sanitized.text.length,
    truncated: Boolean(params.sanitized.truncatedFrom),
    removed_control_chars: params.sanitized.removedControlChars,
    removed_zero_width_chars: params.sanitized.removedZeroWidthChars,
  };
}

export async function extractResumeFromText(
  rawText: string,
  options: ExtractResumeOptions = {},
): Promise<ResumeExtractionResult> {
  const cacheKey = textHash(`resume::${options.maskPii ? 'masked' : 'raw'}::${rawText}`);

  if (!options.skipCache) {
    const cachedResult = resumeCache.get(cacheKey);
    if (cachedResult) return { ...cachedResult, cached: true };
  }

  const sanitized = sanitizeUntrustedText(rawText);
  const maskSummary = options.maskPii
    ? maskPII(sanitized.text, options.piiOptions).redactions
    : undefined;

  const payloadSource = options.maskPii
    ? maskPII(sanitized.text, options.piiOptions).text
    : sanitized.text;

  const prompt = `${RESUME_EXTRACTION_USER_PROMPT}\n\n${wrapUntrustedContent(payloadSource)}`;

  const { object, stats } = await generateStructuredObject({
    schema: CanonicalResumeSchema,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0,
    maxTokens: 4_000,
    purpose: options.purpose ?? 'extract:resume',
    generate: options.generate,
  });

  const withDefaults = applyResumeDefaults(object as CanonicalResume);

  // Dual-pass validation: drop anything that is not literally in the document.
  const { resume, validation } = validateExtraction(withDefaults, rawText);

  const result: ResumeExtractionResult = {
    resume,
    validation,
    safety: buildSafetyReport({ sanitized, document: 'resume', maskSummary }),
    stats,
    cached: false,
  };

  if (!options.skipCache) resumeCache.set(cacheKey, result);
  return result;
}

export async function extractJobDescriptionFromText(
  rawText: string,
  options: ExtractResumeOptions = {},
): Promise<JdExtractionResult> {
  const cacheKey = textHash(`jd::${options.maskPii ? 'masked' : 'raw'}::${rawText}`);

  if (!options.skipCache) {
    const cachedResult = jdCache.get(cacheKey);
    if (cachedResult) return { ...cachedResult, cached: true };
  }

  const sanitized = sanitizeUntrustedText(rawText);
  const maskSummary = options.maskPii
    ? maskPII(sanitized.text, options.piiOptions).redactions
    : undefined;

  const payloadSource = options.maskPii
    ? maskPII(sanitized.text, options.piiOptions).text
    : sanitized.text;

  const prompt = `${JD_EXTRACTION_USER_PROMPT}\n\n${wrapUntrustedContent(payloadSource)}`;

  const { object, stats } = await generateStructuredObject({
    schema: CanonicalJDSchema,
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt,
    temperature: 0,
    maxTokens: 3_000,
    purpose: options.purpose ?? 'extract:job_description',
    generate: options.generate,
  });

  const jobDescription = applyJdDefaults(object as CanonicalJD);

  const result: JdExtractionResult = {
    jobDescription,
    safety: buildSafetyReport({ sanitized, document: 'job_description', maskSummary }),
    stats,
    cached: false,
  };

  if (!options.skipCache) jdCache.set(cacheKey, result);
  return result;
}

/** Merge per-document injection notices into one object for the UI. */
export function mergeSafetyNotices(notices: Array<PromptInjectionNotice | null | undefined>): PromptInjectionNotice {
  const documents = new Set<'resume' | 'job_description'>();
  const matches = new Set<string>();

  for (const notice of notices) {
    if (!notice) continue;
    if (!notice.flagged) continue;
    for (const document of notice.documents) documents.add(document);
    for (const match of notice.matches) matches.add(match);
  }

  return {
    flagged: matches.size > 0,
    matches: Array.from(matches),
    documents: Array.from(documents),
  };
}

/** Test helpers. */
export function resetExtractionCaches(): void {
  resumeCache.clear();
  jdCache.clear();
}
