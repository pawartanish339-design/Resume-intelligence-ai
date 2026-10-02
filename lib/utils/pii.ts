/**
 * PII masking (opt-in) applied BEFORE document text leaves our infrastructure
 * towards the LLM provider. Redacted values are never restored -- the extracted
 * contact fields simply come back `null`, which is the intended privacy trade-off.
 *
 * Also used to keep identifiers out of analytics metadata.
 */

export interface PiiMaskOptions {
  /** Redact phone numbers (default true). */
  maskPhone?: boolean;
  /** Redact street addresses (default true). */
  maskAddress?: boolean;
  /** Redact social/profile URLs such as linkedin.com/in/... (default true). */
  maskSocialUrls?: boolean;
  /** Redact email addresses (default false -- the extractor needs the contact email). */
  maskEmails?: boolean;
  /** Replacement token. */
  placeholder?: string;
}

export interface PiiMaskResult {
  text: string;
  /** Which categories were rewritten, for the UI notice + analytics (no values). */
  redactions: Record<string, number>;
  masked: boolean;
}

const PHONE_PATTERNS: RegExp[] = [
  // International with country code: +1 415 555 0100 / +44 20 7946 0958
  /\+\d{1,3}[\s.\-()]?\d{2,4}[\s.\-()]?\d{3,4}[\s.\-()]?\d{2,4}/g,
  // North-American style: (415) 555-0100 / 415-555-0100 / 415.555.0100
  /\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g,
  // Dotted/space grouped European style: 020 7946 0958
  /\b0\d{2,3}[\s.\-]\d{3,4}[\s.\-]\d{3,4}\b/g,
];

const STREET_ADDRESS_PATTERN =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s){0,4}(?:Street|St\.?|Avenue|Ave\.?|Boulevard|Blvd\.?|Road|Rd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Way|Place|Pl\.?|Terrace|Ter\.?|Highway|Hwy\.?|Parkway|Pkwy\.?|Circle|Cir\.?|Suite|Ste\.?|Apt\.?|Unit)\b\.?/gi;

const SOCIAL_URL_PATTERN =
  /\b(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|behance\.net|dribbble\.com|medium\.com|stackoverflow\.com|angel\.co|crunchbase\.com)\/[^\s,;)]*/gi;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function countMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    total += (text.match(global) ?? []).length;
  }
  return total;
}

/**
 * Redact PII from free text. Order matters: URLs first (they can contain digits
 * that look like phone numbers), then addressed lines, then phones, then emails.
 */
export function maskPII(text: string, options: PiiMaskOptions = {}): PiiMaskResult {
  const {
    maskPhone: doPhone = true,
    maskAddress: doAddress = true,
    maskSocialUrls: doSocial = true,
    maskEmails: doEmails = false,
    placeholder = '[REDACTED]',
  } = options;

  const redactions: Record<string, number> = {};
  let output = text;

  if (doSocial) {
    const before = countMatches(output, [SOCIAL_URL_PATTERN]);
    if (before > 0) {
      output = output.replace(SOCIAL_URL_PATTERN, `[REDACTED_PROFILE_URL]`);
      redactions.social_url = before;
    }
  }

  if (doAddress) {
    const before = countMatches(output, [STREET_ADDRESS_PATTERN]);
    if (before > 0) {
      output = output.replace(STREET_ADDRESS_PATTERN, `[REDACTED_ADDRESS]`);
      redactions.street_address = before;
    }
  }

  if (doPhone) {
    const before = countMatches(output, PHONE_PATTERNS);
    if (before > 0) {
      for (const pattern of PHONE_PATTERNS) {
        const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
        output = output.replace(global, placeholder);
      }
      redactions.phone = before;
    }
  }

  if (doEmails) {
    const before = countMatches(output, [EMAIL_PATTERN]);
    if (before > 0) {
      output = output.replace(EMAIL_PATTERN, placeholder);
      redactions.email = before;
    }
  }

  return {
    text: output,
    redactions,
    masked: Object.keys(redactions).length > 0,
  };
}

/** Strip PII from a metadata object before writing it to analytics_events. */
export function sanitizeAnalyticsMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = ['email', 'phone', 'address', 'name', 'linkedin', 'github', 'resume_text', 'jd_text'];
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE.some((needle) => key.toLowerCase().includes(needle))) continue;
    if (typeof value === 'string' && value.length > 500) {
      out[key] = `${value.slice(0, 500)}…`;
      continue;
    }
    out[key] = value;
  }
  return out;
}
