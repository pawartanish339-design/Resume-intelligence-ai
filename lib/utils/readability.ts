/**
 * Deterministic readability metrics (Flesch Reading Ease / Flesch-Kincaid Grade)
 * plus bullet-length statistics used by the content-quality service.
 *
 * The syllable heuristic is the standard vowel-group approximation; it is
 * intentionally simple and fully deterministic (identical input -> identical score).
 */

const VOWELS = 'aeiouy';

export function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '');
  if (cleaned.length === 0) return 0;
  if (cleaned.length <= 3) return 1;

  let processed = cleaned;
  if (processed.endsWith('es') || processed.endsWith('ed')) {
    processed = processed.slice(0, -2);
  } else if (processed.endsWith('e') && !processed.endsWith('le')) {
    processed = processed.slice(0, -1);
  }

  let count = 0;
  let previousWasVowel = false;
  for (const char of processed) {
    const isVowel = VOWELS.includes(char);
    if (isVowel && !previousWasVowel) count += 1;
    previousWasVowel = isVowel;
  }

  return Math.max(1, count);
}

export function countWords(text: string): number {
  const matches = text.match(/[A-Za-z][A-Za-z'’\-]*/g);
  return matches ? matches.length : 0;
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed
    .split(/[.!?]+(?=\s|$)/)
    .map((part) => part.trim())
    .filter((part) => countWords(part) > 0);
  return Math.max(1, parts.length);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export interface ReadabilityScores {
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  avgWordsPerSentence: number;
  fleschReadingEase: number;
  fleschKincaidGrade: number;
}

/** Empty/very short text returns a neutral (0/1) reading rather than NaN. */
export function readability(text: string): ReadabilityScores {
  const words = text.match(/[A-Za-z][A-Za-z'’\-]*/g) ?? [];
  const wordCount = words.length;
  const sentenceCount = countSentences(text);
  const syllableCount = words.reduce((total, word) => total + countSyllables(word), 0);

  if (wordCount === 0 || sentenceCount === 0) {
    return {
      wordCount,
      sentenceCount,
      syllableCount,
      avgWordsPerSentence: 0,
      fleschReadingEase: 0,
      fleschKincaidGrade: 0,
    };
  }

  const avgWordsPerSentence = wordCount / sentenceCount;
  const avgSyllablesPerWord = syllableCount / wordCount;

  const fleschReadingEase = 206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord;
  const fleschKincaidGrade =
    0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;

  return {
    wordCount,
    sentenceCount,
    syllableCount,
    avgWordsPerSentence: round1(avgWordsPerSentence),
    fleschReadingEase: round1(fleschReadingEase),
    fleschKincaidGrade: round1(fleschKincaidGrade),
  };
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

export interface BulletLengthStats {
  count: number;
  avgWords: number;
  minWords: number;
  maxWords: number;
  /** Share of bullets within the ideal 12-28 word band (0..1). */
  withinIdealBand: number;
}

export const IDEAL_BULLET_MIN_WORDS = 12;
export const IDEAL_BULLET_MAX_WORDS = 28;

export function bulletLengthStats(bullets: string[]): BulletLengthStats {
  const counts = bullets
    .map((bullet) => countWords(bullet))
    .filter((count) => count > 0);

  if (counts.length === 0) {
    return { count: 0, avgWords: 0, minWords: 0, maxWords: 0, withinIdealBand: 0 };
  }

  const withinBand = counts.filter(
    (count) => count >= IDEAL_BULLET_MIN_WORDS && count <= IDEAL_BULLET_MAX_WORDS,
  ).length;

  return {
    count: counts.length,
    avgWords: round1(counts.reduce((sum, value) => sum + value, 0) / counts.length),
    minWords: Math.min(...counts),
    maxWords: Math.max(...counts),
    withinIdealBand: withinBand / counts.length,
  };
}

/**
 * Map a Flesch Reading Ease value to a 0-100 score where professional writing
 * (roughly 30-70, i.e. "difficult" to "plain") scores best. Resume bullets are
 * dense by nature; extremely simple or extremely convoluted prose is penalised.
 */
export function readabilityToScore(ease: number): number {
  if (!Number.isFinite(ease)) return 0;
  // Peak at ease = 50, tolerance +/- 35 points.
  const distance = Math.abs(ease - 50);
  const score = 100 - (distance / 35) * 60;
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}
