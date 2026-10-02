import {
  CanonicalResumeSchema,
  type CanonicalResume,
  type ExtractionValidation,
} from '@/lib/ai/schemas';
import { UNTRUSTED_CLOSE_TAG, UNTRUSTED_OPEN_TAG } from '@/lib/ai/prompts';

/**
 * Prompt-injection defence + extraction grounding.
 *
 * Layered approach:
 *   L1  sanitizeUntrustedText()  -- neutralise instruction-like phrases, strip
 *                                   control/zero-width characters, hard cap length
 *   L2  wrapUntrustedContent()   -- delimiter isolation with the delimiter escaped
 *   L3  schema-bounded outputs    -- generateObject cannot return free-form text
 *   L4  validateExtraction()      -- every extracted identifier must appear in the
 *                                   raw document, otherwise it is dropped
 *   L5  grounding checks          -- recommendation quotes must be real substrings
 */

export interface SanitizeOptions {
  maxLength?: number;
  /** Replacement inserted where an instruction-like phrase was neutralised. */
  placeholder?: string;
}

export interface SanitizeResult {
  text: string;
  flagged: boolean;
  matches: string[];
  /** Original length when the text had to be truncated. */
  truncatedFrom?: number;
  removedControlChars: number;
  removedZeroWidthChars: number;
}

/** Instruction-like patterns we neutralise before the text reaches a model. */
export const INJECTION_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: 'ignore_previous_instructions', regex: /\bignore\s+(?:all\s+|any\s+)?(?:the\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|directives?|commands?)/gi },
  { name: 'disregard_above', regex: /\bdisregard\s+(?:the\s+|all\s+|any\s+)?(?:above|previous|prior|earlier|foregoing)\b[^.\n]{0,60}/gi },
  { name: 'system_prompt_reference', regex: /\bsystem\s+(?:prompt|directive|instruction|instructions|message|role)s?\b/gi },
  { name: 'role_override', regex: /\byou\s+are\s+now\b[^.\n]{0,60}/gi },
  { name: 'admin_mode', regex: /\b(?:admin|administrator|root|developer|debug|god|sudo)\s+mode\b/gi },
  { name: 'print_system_instructions', regex: /\b(?:print|show|reveal|display|output|repeat|echo)\s+(?:me\s+)?(?:the\s+|your\s+)?(?:system\s+|initial\s+|original\s+|full\s+|hidden\s+){0,2}(?:prompt|instructions?|directives?|rules?)\b/gi },
  { name: 'api_key_probe', regex: /\b(?:api[\s_-]?key|secret[\s_-]?key|access[\s_-]?token|env(?:ironment)?\s+variables?)\b/gi },
  { name: 'jailbreak', regex: /\b(?:jailbreak|jail\s+break|DAN\s+mode|do\s+anything\s+now)\b/gi },
  { name: 'score_manipulation', regex: /\b(?:set|assign|force|override|change|inflate)\s+(?:the\s+)?(?:final\s+)?(?:score|scores|scoring|rating|ranking|result)\b[^.\n]{0,40}/gi },
  { name: 'instruction_override', regex: /\b(?:override|ignore|bypass|skip)\b[^\n]{0,24}\b(?:system|scoring|score|rules?|guardrails?|filters?)\b/gi },
  { name: 'unrestricted_persona', regex: /\b(?:act|behave|respond|answer)\s+as\s+(?:an?\s+)?(?:ai|a\.i\.|assistant|model|bot|chatbot)\b[^.\n]{0,60}|\bwith\s+no\s+(?:restrictions?|limitations?|filters?|rules?|guardrails?)\b/gi },
  { name: 'output_format_override', regex: /\b(?:respond|reply|output|answer)\s+(?:only\s+)?(?:with|in)\s+(?:the\s+)?(?:following|this)\s+(?:format|json|text|way)\b[^.\n]{0,40}/gi },
  { name: 'new_instructions', regex: /\bnew\s+(?:instructions?|rules?|system\s+prompt)\s*[:\-]/gi },
  { name: 'schema_manipulation', regex: /\b(?:bypass|ignore|skip)\s+(?:the\s+)?(?:schema|validation|safety|guardrails?|filters?)\b/gi },
  { name: 'tool_invocation', regex: /<\/?(?:untrusted_document_content|system|assistant|tool_use|function_calls?)>/gi },
];

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g;

const DEFAULT_MAX_LENGTH = 30_000;

/**
 * Neutralise prompt-injection payloads in untrusted document text.
 * The returned `matches` list is safe for the UI (pattern names, not payload text).
 */
export function sanitizeUntrustedText(input: string, options: SanitizeOptions = {}): SanitizeResult {
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  const placeholder = options.placeholder ?? '[redacted-instruction]';

  const matches: string[] = [];
  let text = input ?? '';

  const zeroWidthCount = (text.match(ZERO_WIDTH_CHARS) ?? []).length;
  text = text.replace(ZERO_WIDTH_CHARS, '');

  const controlCount = (text.match(CONTROL_CHARS) ?? []).length;
  text = text.replace(CONTROL_CHARS, ' ');

  for (const { name, regex } of INJECTION_PATTERNS) {
    const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
    if (global.test(text)) {
      matches.push(name);
      const replacer = new RegExp(global.source, global.flags);
      text = text.replace(replacer, placeholder);
    }
  }

  // Collapse the runs of whitespace the replacements may have produced.
  text = text.replace(/[ \t]{3,}/g, '  ').replace(/\n{4,}/g, '\n\n\n').trim();

  let truncatedFrom: number | undefined;
  if (text.length > maxLength) {
    truncatedFrom = text.length;
    text = text.slice(0, maxLength);
    // Never cut mid-word if we can avoid it.
    const lastBreak = Math.max(text.lastIndexOf('\n'), text.lastIndexOf(' '));
    if (lastBreak > maxLength * 0.9) text = text.slice(0, lastBreak);
    text = `${text}\n[content truncated]`;
    matches.push('truncated');
  }

  return {
    text,
    flagged: matches.length > 0,
    matches: Array.from(new Set(matches)),
    truncatedFrom,
    removedControlChars: controlCount,
    removedZeroWidthChars: zeroWidthCount,
  };
}

/**
 * Wrap sanitized document text in the isolation delimiter. Any literal occurrence
 * of the delimiter inside the payload is escaped so the document cannot close the
 * tag and escape the data region.
 */
export function wrapUntrustedContent(sanitizedText: string): string {
  const escaped = sanitizedText
    .split(UNTRUSTED_OPEN_TAG).join('[[untrusted_document_content]]')
    .split(UNTRUSTED_CLOSE_TAG).join('[[/untrusted_document_content]]');

  return `${UNTRUSTED_OPEN_TAG}\n${escaped}\n${UNTRUSTED_CLOSE_TAG}`;
}

/** Whitespace/punctuation-insensitive normalisation used by every grounding check. */
export function normalizeForGrounding(text: string): string {
  return (text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'%$.,:;/()+-]/gu, '')
    .trim();
}

/**
 * True when `excerpt` really appears in `source` (whitespace/punctuation
 * normalised substring test). Long excerpts are additionally accepted when >= 92%
 * of their tokens appear in the same order -- LLMs occasionally drop a comma.
 */
export function isGroundedIn(excerpt: string | null | undefined, source: string | null | undefined): boolean {
  if (!excerpt || !source) return false;
  const normalizedExcerpt = normalizeForGrounding(excerpt);
  if (normalizedExcerpt.length < 4) return false;

  const normalizedSource = normalizeForGrounding(source);
  if (normalizedSource.includes(normalizedExcerpt)) return true;

  // Token-order tolerant fallback for longer quotes.
  const excerptTokens = normalizedExcerpt.split(' ').filter((token) => token.length > 1);
  if (excerptTokens.length < 6) return false;

  const sourceTokens = new Set(normalizedSource.split(' '));
  const covered = excerptTokens.filter((token) => sourceTokens.has(token)).length;
  return covered / excerptTokens.length >= 0.92;
}

/** 1-indexed line number of the first line containing `excerpt` (null when absent). */
export function locateExcerptLine(excerpt: string, source: string): number | null {
  if (!excerpt || !source) return null;

  const excerptNeedle = normalizeForGrounding(excerpt).slice(0, 120);
  if (!excerptNeedle) return null;

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (normalizeForGrounding(lines[index] ?? '').includes(excerptNeedle)) {
      return index + 1;
    }
  }

  // Excerpt spans multiple lines: locate by its first tokens.
  const firstTokens = excerptNeedle.split(' ').slice(0, 6).join(' ');
  for (let index = 0; index < lines.length; index += 1) {
    if (firstTokens && normalizeForGrounding(lines[index] ?? '').includes(firstTokens)) {
      return index + 1;
    }
  }
  return null;
}

/**
 * Lines of the job description that mention a requirement, with the nearest
 * preceding heading -- the deterministic half of the recommendation payload.
 */
export interface JdSourceExcerpt {
  excerpt: string;
  line: number | null;
  section: string | null;
}

const HEADING_MAX_WORDS = 8;

function looksLikeHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > HEADING_MAX_WORDS) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  if (letters.length < 3) return false;
  const upperRatio = letters ? (letters.match(/[A-Z]/g) ?? []).length / letters.length : 0;
  return upperRatio > 0.6 || /^[A-Z][\w\s&/,'-]{2,60}:?$/.test(trimmed);
}

/**
 * Find the verbatim JD lines that state a requirement, plus the nearest heading.
 * Deterministic: uses the supplied search terms (canonical + aliases) only.
 */
export function findJdExcerpt(
  jdText: string,
  searchTerms: string[],
  fallbackSectionHint?: string | null,
): JdSourceExcerpt | null {
  if (!jdText) return null;

  const terms = searchTerms
    .map((term) => normalizeForGrounding(term))
    .filter((term) => term.length >= 3);

  if (terms.length === 0) return null;

  const lines = jdText.split(/\r?\n/);
  let currentSection: string | null = fallbackSectionHint ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = (lines[index] ?? '').trim();
    if (!rawLine) continue;

    if (looksLikeHeading(rawLine)) {
      currentSection = rawLine.replace(/:$/, '');
      continue;
    }

    const normalizedLine = normalizeForGrounding(rawLine);
    const hit = terms.some((term) => normalizedLine.includes(term));
    if (!hit) continue;

    // Prefer the full sentence within the line when it is short enough.
    const sentence = rawLine.length <= 400 ? rawLine : `${rawLine.slice(0, 397)}...`;

    return {
      excerpt: sentence,
      line: index + 1,
      section: currentSection,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dual-pass extraction validation
// ---------------------------------------------------------------------------

export interface ValidationOutcome {
  resume: CanonicalResume;
  validation: ExtractionValidation;
}

function appearsInText(value: string | null | undefined, haystack: string): boolean {
  if (!value) return false;
  const needle = normalizeForGrounding(value);
  if (needle.length < 2) return true; // nothing meaningful to verify
  if (haystack.includes(needle)) return true;

  // Long names may be hyphenated/wrapped across lines in the PDF text layer.
  const collapsed = needle.replace(/[\s-]+/g, '');
  if (collapsed.length >= 6) {
    const compactHaystack = haystack.replace(/[\s-]+/g, '');
    if (compactHaystack.includes(collapsed)) return true;
  }

  // Initials-only variants ("J. Smith" vs "John Smith") are accepted when the
  // surname matches and the first initials agree.
  const tokens = needle.split(' ').filter((token) => token.length > 1);
  if (tokens.length >= 2) {
    const surname = tokens[tokens.length - 1] as string;
    if (surname.length > 3 && haystack.includes(surname)) {
      const firstInitial = (tokens[0] as string).charAt(0);
      return new RegExp(`\\b${firstInitial}\\w*\\s+${surname}`).test(haystack);
    }
  }

  return false;
}

/**
 * Every identifier the extraction claims must exist in the source document.
 * Values that cannot be verified are removed (arrays) or nulled (scalars) and
 * reported so the UI can explain the correction.
 */
export function validateExtraction(resumeInput: CanonicalResume, rawText: string): ValidationOutcome {
  const parsed = CanonicalResumeSchema.parse(resumeInput);
  const haystack = normalizeForGrounding(rawText);
  const warnings: ExtractionValidation['warnings'] = [];

  const resume: CanonicalResume = structuredCloneSafe(parsed);

  // Emails -------------------------------------------------------------------
  if (resume.contact.email && !appearsInText(resume.contact.email, haystack)) {
    warnings.push({
      field: 'contact.email',
      value: resume.contact.email,
      reason: 'Email address was not found verbatim in the document text.',
    });
    resume.contact.email = null;
  }

  // Institutions -------------------------------------------------------------
  // The institution identifies the record, so an unverifiable one drops the whole
  // entry rather than leaving a degree attached to an unknown school.
  const keptEducation: CanonicalResume['education'] = [];
  for (const entry of resume.education) {
    if (appearsInText(entry.institution, haystack)) {
      keptEducation.push(entry);
      continue;
    }
    warnings.push({
      field: 'education.institution',
      value: entry.institution,
      reason: 'Institution was not found verbatim in the document text, so the entry was removed.',
    });
  }
  resume.education = keptEducation;

  // Degrees ------------------------------------------------------------------
  resume.education = resume.education.map((entry) => {
    if (!entry.degree) return entry;
    if (appearsInText(entry.degree, haystack)) return entry;
    warnings.push({
      field: 'education.degree',
      value: entry.degree,
      reason: 'Degree title was not found verbatim in the document text.',
    });
    return { ...entry, degree: null };
  });

  // Employers ----------------------------------------------------------------
  resume.experience = resume.experience.map((entry) => {
    if (appearsInText(entry.company, haystack)) return entry;
    warnings.push({
      field: 'experience.company',
      value: entry.company,
      reason: 'Employer name was not found verbatim in the document text.',
    });
    return { ...entry, company: '' };
  });

  // Certifications -----------------------------------------------------------
  const keptCertifications: CanonicalResume['certifications'] = [];
  for (const certification of resume.certifications) {
    if (appearsInText(certification.name, haystack)) {
      keptCertifications.push(certification);
    } else {
      warnings.push({
        field: 'certifications.name',
        value: certification.name,
        reason: 'Certification was not found verbatim in the document text.',
      });
    }
  }
  resume.certifications = keptCertifications;

  return {
    resume,
    validation: { validated: warnings.length === 0, warnings },
  };
}

/** structuredClone with a JSON fallback for older runtimes. */
function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
