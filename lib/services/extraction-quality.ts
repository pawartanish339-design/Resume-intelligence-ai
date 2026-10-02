import type { ExtractionQuality } from '@/lib/ai/schemas';
import { dictionaryWordRatio } from '@/lib/utils/wordlist';

/**
 * Extraction quality gate.
 *
 * A parse "passes" only when the text looks like real prose:
 *   1. more than 150 usable characters,
 *   2. more than 60% of alphabetic tokens are recognisable dictionary/tech words,
 *   3. whitespace is not more than half of the document (layout noise),
 *   4. no unbroken garbage run longer than 200 characters (broken CID fonts),
 *   5. replacement/private-use glyph characters stay under 2%.
 *
 * Failing any check triggers the OCR fallback for PDFs, or a friendly 422 for DOCX.
 * These thresholds are intentionally conservative: a false negative costs one OCR
 * pass, a false positive pollutes every downstream score.
 */

export const MIN_CHARACTERS = 150;
export const MIN_DICTIONARY_RATIO = 0.6;
export const MAX_WHITESPACE_RATIO = 0.5;
export const MAX_UNBROKEN_RUN = 200;
export const MAX_GARBAGE_CHAR_RATIO = 0.02;

const ALLOWED_PUNCTUATION = new Set([
  ' ', '\n', '\t', '.', ',', ';', ':', '!', '?', "'", '"', '(', ')', '[', ']', '{', '}',
  '-', '_', '/', '\\', '|', '+', '&', '@', '#', '%', '*', '=', '<', '>', '~', '$', '•',
  '·', '–', '—', '’', '‘', '“', '”', '…', '★', '☆', '▪', '◦',
]);

function isAllowedCharacter(char: string): boolean {
  if (ALLOWED_PUNCTUATION.has(char)) return true;
  if (/[\p{L}\p{N}]/u.test(char)) return true;
  return false;
}

/** Longest run of characters that are neither letters, digits, nor normal punctuation. */
export function longestGarbageRun(text: string): number {
  let longest = 0;
  let current = 0;

  for (const char of text) {
    if (isAllowedCharacter(char)) {
      current = 0;
      continue;
    }
    current += 1;
    if (current > longest) longest = current;
  }

  return longest;
}

/** Longest stretch without any whitespace (e.g. minified or encoded blobs). */
export function longestUnbrokenRun(text: string): number {
  let longest = 0;
  let current = 0;

  for (const char of text) {
    if (/\s/.test(char)) {
      current = 0;
      continue;
    }
    current += 1;
    if (current > longest) longest = current;
  }

  return longest;
}

export function whitespaceRatio(text: string): number {
  if (text.length === 0) return 1;
  const whitespace = (text.match(/\s/g) ?? []).length;
  return whitespace / text.length;
}

/** Share of characters that indicate a broken text layer (U+FFFD, private use). */
export function garbageCharacterRatio(text: string): number {
  if (text.length === 0) return 1;
  const garbage = (text.match(/[\uFFFD\uE000-\uF8FF\u25A0-\u25FF]/g) ?? []).length;
  return garbage / text.length;
}

/** Count of mostly-nonsense tokens (long, consonant-heavy) -- a fallback signal. */
export function nonsenseTokenRatio(text: string): number {
  const tokens = text.match(/[A-Za-z]{3,}/g) ?? [];
  if (tokens.length === 0) return 1;

  let nonsense = 0;
  for (const token of tokens) {
    const vowels = (token.match(/[aeiouAEIOU]/g) ?? []).length;
    const vowelRatio = vowels / token.length;
    const hasLongConsonantRun = /[bcdfghjklmnpqrstvwxz]{6,}/i.test(token);
    if (vowelRatio < 0.15 || hasLongConsonantRun) nonsense += 1;
  }
  return nonsense / tokens.length;
}

export function assessExtractionQuality(text: string): ExtractionQuality {
  const normalized = text ?? '';
  const charCount = normalized.trim().length;
  const dictionary = dictionaryWordRatio(normalized);
  const whitespace = whitespaceRatio(normalized);
  const unbroken = longestUnbrokenRun(normalized);
  const garbage = garbageCharacterRatio(normalized);
  const nonsense = nonsenseTokenRatio(normalized);

  const reasons: string[] = [];

  if (charCount <= MIN_CHARACTERS) {
    reasons.push(`Only ${charCount} characters were extracted (minimum ${MIN_CHARACTERS}).`);
  }

  if (dictionary < MIN_DICTIONARY_RATIO) {
    reasons.push(
      `Only ${Math.round(dictionary * 100)}% of words matched a dictionary of common/technical terms (minimum ${Math.round(
        MIN_DICTIONARY_RATIO * 100,
      )}%).`,
    );
  }

  if (whitespace > MAX_WHITESPACE_RATIO) {
    reasons.push(
      `${Math.round(whitespace * 100)}% of the text is whitespace, which suggests a broken layout.`,
    );
  }

  if (unbroken > MAX_UNBROKEN_RUN) {
    reasons.push(`Found an unbroken run of ${unbroken} characters, which suggests corrupted encoding.`);
  }

  if (garbage > MAX_GARBAGE_CHAR_RATIO) {
    reasons.push(
      `${Math.round(garbage * 1000) / 10}% of characters are unmapped symbols (replacement or private-use glyphs).`,
    );
  }

  if (nonsense > 0.35) {
    reasons.push(
      `${Math.round(nonsense * 100)}% of words look garbled (implausible vowel or consonant patterns).`,
    );
  }

  return {
    passed: reasons.length === 0,
    charCount,
    dictionaryRatio: Math.round(dictionary * 1000) / 1000,
    whitespaceRatio: Math.round(whitespace * 1000) / 1000,
    longestGarbageRun: unbroken,
    reasons,
  };
}
