import { describe, expect, it } from 'vitest';

import {
  assessExtractionQuality,
  garbageCharacterRatio,
  longestGarbageRun,
  longestUnbrokenRun,
  MAX_GARBAGE_CHAR_RATIO,
  MAX_UNBROKEN_RUN,
  MIN_CHARACTERS,
  MIN_DICTIONARY_RATIO,
  nonsenseTokenRatio,
  whitespaceRatio,
} from '@/lib/services/extraction-quality';
import { makeResume } from '@/tests/helpers/factories';

const CLEAN_RESUME_TEXT = [
  'Dana Example',
  'Senior Backend Engineer',
  '',
  'Summary',
  'Backend engineer with six years building payment and data platforms in TypeScript, Python, and PostgreSQL.',
  '',
  'Experience',
  'Northwind Payments — Senior Backend Engineer',
  'Rebuilt the billing dashboard in TypeScript and React, cutting page load time by 42 percent.',
  'Modelled the double entry ledger schema in PostgreSQL with sixteen tables and row level security.',
  'Reduced the latency of the payment interface from four hundred and eighty milliseconds to one hundred and ninety.',
  '',
  'Education',
  'State University, Bachelor of Science in Computer Science, two thousand and eighteen.',
  'Skills',
  'TypeScript, Python, PostgreSQL, Docker, Kubernetes, Redis, SQL, testing, data modelling, communication.',
].join('\n');

describe('text-quality primitives', () => {
  it('measures whitespace share and returns 1 for empty input', () => {
    expect(whitespaceRatio('abc def')).toBeCloseTo(1 / 7, 5);
    expect(whitespaceRatio('')).toBe(1);
  });

  it('finds the longest garbage run of unmapped characters', () => {
    expect(longestGarbageRun('ok\uFFFD\uFFFD\uFFFDok')).toBe(3);
    expect(longestGarbageRun('plain text')).toBe(0);
    // Normal punctuation and accented letters are not garbage.
    expect(longestGarbageRun('café — “quoted”…')).toBe(0);
  });

  it('finds the longest run without whitespace', () => {
    expect(longestUnbrokenRun('a b cccccccc')).toBe(8);
    expect(longestUnbrokenRun('a b c')).toBe(1);
  });

  it('measures replacement and private-use glyph density', () => {
    expect(garbageCharacterRatio('abc\uFFFD')).toBeCloseTo(0.25, 5);
    expect(garbageCharacterRatio('')).toBe(1);
  });

  it('flags consonant-heavy tokens as nonsense', () => {
    expect(nonsenseTokenRatio('xkcdqwt brtpnsl mrrghn')).toBe(1);
    expect(nonsenseTokenRatio('')).toBe(1);
    expect(nonsenseTokenRatio('engineer engineer engineer')).toBe(0);
  });
});

describe('assessExtractionQuality', () => {
  it('passes a normal resume text', () => {
    const quality = assessExtractionQuality(CLEAN_RESUME_TEXT);

    expect(quality.passed).toBe(true);
    expect(quality.reasons).toEqual([]);
    expect(quality.charCount).toBeGreaterThan(MIN_CHARACTERS);
    expect(quality.dictionaryRatio).toBeGreaterThanOrEqual(MIN_DICTIONARY_RATIO);
    expect(quality.whitespaceRatio).toBeLessThan(0.5);
    expect(quality.longestGarbageRun).toBeLessThanOrEqual(MAX_UNBROKEN_RUN);
  });

  it('also passes the canonical fixture built by the factories', () => {
    const resume = makeResume();
    const text = [
      resume.summary,
      ...resume.experience.flatMap((role) => [role.title, role.company, ...role.bullet_points]),
      ...resume.projects.flatMap((project) => [project.title, project.description, ...project.bullet_points]),
      ...resume.skills.technical,
      ...resume.skills.frameworks_and_tools,
    ].join('\n');

    expect(assessExtractionQuality(text).passed).toBe(true);
  });

  it('rejects a text layer that only produced a few characters', () => {
    const quality = assessExtractionQuality('Dana Example');

    expect(quality.passed).toBe(false);
    expect(quality.reasons.some((reason) => reason.includes(String(MIN_CHARACTERS)))).toBe(true);
  });

  it('rejects a scanned page that produced mostly whitespace', () => {
    const quality = assessExtractionQuality('\n'.repeat(400));

    expect(quality.passed).toBe(false);
    expect(quality.whitespaceRatio).toBe(1);
    expect(quality.reasons.some((reason) => reason.toLowerCase().includes('whitespace'))).toBe(true);
  });

  it('rejects unmapped replacement glyphs above the tolerance', () => {
    const corrupted = `${'real words in a sentence '.repeat(20)}${'\uFFFD'.repeat(60)}${'\uE000'.repeat(60)}`;
    const quality = assessExtractionQuality(corrupted);

    expect(quality.passed).toBe(false);
    expect(garbageCharacterRatio(corrupted)).toBeGreaterThan(MAX_GARBAGE_CHAR_RATIO);
    expect(quality.reasons.some((reason) => reason.includes('unmapped symbols'))).toBe(true);
  });

  it('rejects a broken CID font that produced one enormous unbroken run', () => {
    const broken = `${'a'.repeat(300)}${' valid words follow here '.repeat(8)}`;
    const quality = assessExtractionQuality(broken);

    expect(quality.passed).toBe(false);
    expect(quality.reasons.some((reason) => reason.includes('unbroken run'))).toBe(true);
  });

  it('rejects text that looks garbled rather than written', () => {
    const garbled = 'xkcdqwt brtpnsl mrrghn '.repeat(20);
    const quality = assessExtractionQuality(garbled);

    expect(quality.passed).toBe(false);
    expect(quality.reasons.some((reason) => reason.includes('garbled'))).toBe(true);
  });

  it('is deterministic and never returns NaN', () => {
    const first = assessExtractionQuality(CLEAN_RESUME_TEXT);
    const second = assessExtractionQuality(CLEAN_RESUME_TEXT);

    expect(second).toEqual(first);
    for (const value of [first.dictionaryRatio, first.whitespaceRatio]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
