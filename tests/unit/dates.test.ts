import { describe, expect, it } from 'vitest';

import {
  checkDateFormatConsistency,
  computeTotalExperienceMonths,
  detectDateFormatStyle,
  findOverlappingRanges,
  formatYearMonth,
  isPresentToken,
  isReverseChronological,
  mergeIntervals,
  monthsBetween,
  monthsToYears,
  parseDateRange,
  parseYearMonth,
  toMonths,
} from '@/lib/utils/dates';

const NOW = new Date('2026-10-01T00:00:00Z');

describe('parseYearMonth', () => {
  it('parses month-name, numeric, ISO, and bare-year forms', () => {
    expect(parseYearMonth('Jan 2020')).toEqual({ year: 2020, month: 1 });
    expect(parseYearMonth('January 2020')).toEqual({ year: 2020, month: 1 });
    expect(parseYearMonth('03/2020')).toEqual({ year: 2020, month: 3 });
    expect(parseYearMonth('2020-03')).toEqual({ year: 2020, month: 3 });
    expect(parseYearMonth('2020')).toEqual({ year: 2020, month: 1 });
  });

  it('handles apostrophe years and rejects unusable input', () => {
    expect(parseYearMonth("Mar '21")).toEqual({ year: 2021, month: 3 });
    // A month with no year cannot participate in duration maths.
    expect(parseYearMonth('March')).toBeNull();
    expect(parseYearMonth('')).toBeNull();
    expect(parseYearMonth(null)).toBeNull();
  });
});

describe('parseDateRange', () => {
  it('parses an open-ended current role against the supplied clock', () => {
    const range = parseDateRange('Jan 2020 - Present', NOW);

    expect(range.start).toEqual({ year: 2020, month: 1 });
    expect(range.end).toEqual({ year: 2026, month: 10 });
    expect(range.isCurrent).toBe(true);
    expect(range.parsed).toBe(true);
    expect(range.raw).toBe('Jan 2020 - Present');
  });

  it('parses en dashes, numeric forms, and a lone year', () => {
    const closed = parseDateRange('January 2020 \u2013 March 2022', NOW);
    expect(closed.start).toEqual({ year: 2020, month: 1 });
    expect(closed.end).toEqual({ year: 2022, month: 3 });
    expect(closed.isCurrent).toBe(false);

    const numeric = parseDateRange('01/2020 to 03/2022', NOW);
    expect(numeric.start).toEqual({ year: 2020, month: 1 });
    expect(numeric.end).toEqual({ year: 2022, month: 3 });

    const single = parseDateRange('2019', NOW);
    expect(single.start).toEqual({ year: 2019, month: 1 });
    expect(single.end).toEqual({ year: 2019, month: 12 });
  });

  it('is deterministic and marks unparsable text', () => {
    const first = parseDateRange('sometime in the past', NOW);
    const second = parseDateRange('sometime in the past', NOW);

    expect(first.parsed).toBe(false);
    expect(first.start).toBeNull();
    expect(second).toEqual(first);
  });
});

describe('duration maths', () => {
  it('counts months inclusively and never negatively', () => {
    expect(monthsBetween({ year: 2020, month: 1 }, { year: 2020, month: 3 })).toBe(3);
    expect(monthsBetween({ year: 2021, month: 1 }, { year: 2023, month: 1 })).toBe(25);
    expect(monthsBetween({ year: 2023, month: 5 }, { year: 2020, month: 5 })).toBe(0);
  });

  it('merges overlapping intervals instead of double-counting tenure', () => {
    const merged = mergeIntervals([
      { start: { year: 2020, month: 1 }, end: { year: 2021, month: 12 } },
      { start: { year: 2021, month: 3 }, end: { year: 2022, month: 2 } },
    ]);

    expect(merged).toEqual([
      { start: { year: 2020, month: 1 }, end: { year: 2022, month: 2 } },
    ]);
  });

  it('totals experience with overlap reported separately', () => {
    const result = computeTotalExperienceMonths(
      ['Jan 2020 - Dec 2021', 'Mar 2021 - Feb 2022'],
      { now: NOW },
    );

    expect(result.totalMonths).toBe(26);
    expect(result.overlapMonths).toBe(10);
    expect(result.unparsedRanges).toEqual([]);
    expect(result.invalidRanges).toEqual([]);
  });

  it('quarantines impossible and out-of-range ranges', () => {
    const result = computeTotalExperienceMonths(['2022 - 2019', 'Jan 2020 - Dec 2021', '???'], {
      now: NOW,
    });

    expect(result.totalMonths).toBe(24);
    expect(result.invalidRanges).toEqual(['2022 - 2019']);
    expect(result.unparsedRanges).toEqual(['???']);
  });

  it('filters implausibly long ranges', () => {
    const result = computeTotalExperienceMonths(['1950 - 2024'], { now: NOW });
    expect(result.totalMonths).toBe(0);
    expect(result.invalidRanges).toEqual(['1950 - 2024']);
  });

  it('converts months to a single-decimal year figure', () => {
    expect(monthsToYears(30)).toBe(2.5);
    expect(monthsToYears(0)).toBe(0);
    expect(monthsToYears(12)).toBe(1);
  });

  it('round-trips YearMonth to a stable numeric index', () => {
    expect(toMonths({ year: 2020, month: 1 })).toBe(2020 * 12);
    expect(toMonths({ year: 2021, month: 1 }) - toMonths({ year: 2020, month: 1 })).toBe(12);
    expect(formatYearMonth({ year: 2020, month: 3 })).toBe('Mar 2020');
  });
});

describe('structural date findings', () => {
  it('detects present tokens without matching ordinary years', () => {
    expect(isPresentToken('Present')).toBe(true);
    expect(isPresentToken('Current role')).toBe(true);
    expect(isPresentToken('2022')).toBe(false);
    expect(isPresentToken(null)).toBe(false);
  });

  it('reports reverse-chronological ordering when it can be judged', () => {
    expect(isReverseChronological(['2023 - Present', '2020 - 2023', '2016 - 2020'], NOW)).toBe(true);
    expect(isReverseChronological(['2016 - 2020', '2020 - 2023'], NOW)).toBe(false);
    expect(isReverseChronological(['Present'], NOW)).toBeNull();
  });

  it('classifies the dominant date style and flags mixed usage', () => {
    expect(detectDateFormatStyle('Jan 2020')).toBe('MONTH_NAME_YEAR');
    expect(detectDateFormatStyle('01/2020')).toBe('NUMERIC_MONTH_YEAR');
    expect(detectDateFormatStyle('2020-01')).toBe('YEAR_MONTH');
    expect(detectDateFormatStyle('2020')).toBe('YEAR_ONLY');
    expect(detectDateFormatStyle('')).toBe('UNKNOWN');

    const uniform = checkDateFormatConsistency([
      'Jan 2020',
      'Feb 2021',
      'Mar 2022',
      'Apr 2023',
      '01/2020',
    ]);
    expect(uniform.dominant).toBe('MONTH_NAME_YEAR');
    expect(uniform.styles).toEqual({ MONTH_NAME_YEAR: 4, NUMERIC_MONTH_YEAR: 1 });
    expect(uniform.uniform).toBe(true);

    const mixed = checkDateFormatConsistency(['Jan 2020', '02/2021']);
    expect(mixed.uniform).toBe(false);
  });

  it('finds genuinely overlapping full-time ranges', () => {
    const overlaps = findOverlappingRanges(
      ['Jan 2020 - Dec 2021', 'Mar 2021 - Feb 2022', '2010 - 2015'],
      NOW,
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toEqual({
      a: 'Jan 2020 - Dec 2021',
      b: 'Mar 2021 - Feb 2022',
      overlapMonths: 10,
    });
  });
});
