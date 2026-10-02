import { describe, expect, it } from 'vitest';

import {
  bulletLengthStats,
  countSentences,
  countSyllables,
  countWords,
  IDEAL_BULLET_MAX_WORDS,
  IDEAL_BULLET_MIN_WORDS,
  readability,
  readabilityToScore,
  splitSentences,
} from '@/lib/utils/readability';

describe('counting primitives', () => {
  it('approximates syllables deterministically', () => {
    expect(countSyllables('the')).toBe(1);
    expect(countSyllables('important')).toBe(3);
    expect(countSyllables('engineering')).toBe(4);
    expect(countSyllables('')).toBe(0);
    expect(countSyllables('123')).toBe(0);
  });

  it('counts words without punctuation or numbers', () => {
    expect(countWords("Hello world's fine—yes")).toBe(4);
    expect(countWords('42 metrics and 17 dashboards')).toBe(3);
    expect(countWords('')).toBe(0);
  });

  it('counts sentences and never returns zero for real prose', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('')).toBe(0);
    expect(countSentences('no terminal punctuation here')).toBe(1);
  });

  it('splits sentences on terminal punctuation and newlines', () => {
    expect(splitSentences('First. Second!\nThird?')).toEqual(['First.', 'Second!', 'Third?']);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('readability', () => {
  it('returns a neutral zero reading for empty input rather than NaN', () => {
    const scores = readability('');
    expect(scores.wordCount).toBe(0);
    expect(scores.fleschReadingEase).toBe(0);
    expect(scores.fleschKincaidGrade).toBe(0);
    expect(Number.isFinite(scores.fleschReadingEase)).toBe(true);
  });

  it('produces stable, plausible scores for a paragraph', () => {
    const text =
      'The engineer built a payment service. The service processes one million requests each day. ' +
      'It stores every transaction in a ledger. The ledger supports audits.';
    const first = readability(text);
    const second = readability(text);

    expect(second).toEqual(first);
    expect(first.wordCount).toBeGreaterThanOrEqual(20);
    expect(first.sentenceCount).toBe(4);
    expect(first.fleschReadingEase).toBeGreaterThan(40);
    expect(first.fleschReadingEase).toBeLessThan(120);
    expect(first.avgWordsPerSentence).toBeGreaterThan(5);
  });

  it('scores simpler prose higher than dense prose', () => {
    const simple = readability('The cat sat on the mat. The dog ran in the park.');
    const dense = readability(
      'Notwithstanding the aforementioned architectural considerations, the implementation necessitates substantial infrastructural reconfiguration.',
    );

    expect(simple.fleschReadingEase).toBeGreaterThan(dense.fleschReadingEase);
  });
});

describe('readabilityToScore', () => {
  it('peaks at a Flesch ease of 50 and clamps at the extremes', () => {
    expect(readabilityToScore(50)).toBe(100);
    expect(readabilityToScore(85)).toBe(40);
    expect(readabilityToScore(120)).toBe(0);
    expect(readabilityToScore(0)).toBeCloseTo(14.29, 1);
  });

  it('returns 0 (not NaN) for non-finite input', () => {
    expect(readabilityToScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(readabilityToScore(Number.NaN)).toBe(0);
  });
});

describe('bulletLengthStats', () => {
  it('returns zeros for an empty list', () => {
    expect(bulletLengthStats([])).toEqual({
      count: 0,
      avgWords: 0,
      minWords: 0,
      maxWords: 0,
      withinIdealBand: 0,
    });
  });

  it('shares bullets inside the ideal 12-28 word band', () => {
    const short = 'Cut latency.'; // 2 words
    const ideal = Array.from({ length: IDEAL_BULLET_MIN_WORDS }, () => 'word').join(' ');
    const long = Array.from({ length: IDEAL_BULLET_MAX_WORDS + 10 }, () => 'word').join(' ');

    const stats = bulletLengthStats([short, ideal, long]);

    expect(stats.count).toBe(3);
    expect(stats.minWords).toBe(2);
    expect(stats.maxWords).toBe(IDEAL_BULLET_MAX_WORDS + 10);
    expect(stats.withinIdealBand).toBeCloseTo(1 / 3, 3);
  });

  it('ignores bullets that contain no words', () => {
    expect(bulletLengthStats(['—', '']).count).toBe(0);
  });
});
