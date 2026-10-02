/**
 * Date parsing for resume experience sections.
 *
 * Handles the formats that actually appear in resumes:
 *   "Jan 2020 - Present", "January 2020 – March 2022", "01/2020 - 03/2022",
 *   "2020 - 2022", "2020", "Summer 2019", "Mar '21 - Present", "2020-01 to 2021-06".
 *
 * Everything is deterministic and dependency-free so it can be unit tested and so
 * identical inputs always yield identical durations.
 */

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

export interface DateRange {
  start: YearMonth | null;
  end: YearMonth | null;
  isCurrent: boolean;
  /** Original text, for reporting. */
  raw: string;
  /** True when at least the years could be parsed. */
  parsed: boolean;
}

export interface ExperienceDuration {
  totalMonths: number;
  /** Merged, non-overlapping intervals used for the total. */
  mergedIntervals: Array<{ start: YearMonth; end: YearMonth }>;
  ranges: DateRange[];
  /** Ranges that could not be parsed at all. */
  unparsedRanges: string[];
  /** Ranges with an end that precedes the start (data quality finding). */
  invalidRanges: string[];
  overlapMonths: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const PRESENT_TOKENS = [
  'present', 'current', 'now', 'today', 'ongoing', 'date', 'till date', 'to date', 'present day',
];

const RANGE_SEPARATOR = /\s*(?:-|–|—|to|through|thru|until|until\s+present)\s*/i;

/** Parse a single year-month token such as "Jan 2020", "01/2020", "2020-03", "2020". */
export function parseYearMonth(input: string | null | undefined): YearMonth | null {
  if (!input) return null;
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // ISO-ish: 2020-03 or 2020/03
  const iso = text.match(/\b(19|20)\d{2}\s*[-/]\s*(0?[1-9]|1[0-2])\b/);
  if (iso) {
    const year = Number(iso[0].match(/\b(19|20)\d{2}\b/)?.[0]);
    if (year) return { year, month: Number(iso[2]) };
  }

  // Numeric US/EU: 03/2020 or 3.2020
  const numeric = text.match(/\b(0?[1-9]|1[0-2])\s*[-/.]\s*((?:19|20)\d{2})\b/);
  if (numeric) {
    return { year: Number(numeric[2]), month: Number(numeric[1]) };
  }

  // Month name (+ optional year)
  const monthName = text.match(/\b([a-z]{3,9})\.?\s*'?(\d{2,4})?\b/);
  if (monthName && MONTHS[monthName[1]]) {
    const month = MONTHS[monthName[1]];
    const year = normalizeYear(monthName[2]);
    if (year !== null) return { year, month };
    return null; // month without a year is not usable for duration math
  }

  // Bare year
  const yearOnly = text.match(/\b((?:19|20)\d{2})\b/);
  if (yearOnly) {
    return { year: Number(yearOnly[1]), month: 1 };
  }

  return null;
}

function normalizeYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (raw.length === 2) return value >= 70 ? 1900 + value : 2000 + value;
  if (value >= 1900 && value <= 2100) return value;
  return null;
}

/** True when the token clearly means "still working here". */
export function isPresentToken(input: string | null | undefined): boolean {
  if (!input) return false;
  const text = input.trim().toLowerCase();
  return PRESENT_TOKENS.some((token) => text.includes(token));
}

/**
 * Parse "start - end" style ranges. Falls back to a single year/date token which is
 * treated as a completed range within that year.
 */
export function parseDateRange(input: string | null | undefined, now: Date = new Date()): DateRange {
  const raw = (input ?? '').trim();
  const empty: DateRange = { start: null, end: null, isCurrent: false, raw, parsed: false };
  if (!raw) return empty;

  const normalized = raw.replace(/\u2013|\u2014/g, '-');
  const parts = normalized.split(RANGE_SEPARATOR).filter((part) => part.trim().length > 0);

  if (parts.length >= 2) {
    const startText = parts[0];
    const endText = parts.slice(1).join(' ');
    const start = parseYearMonth(startText);
    const current = isPresentToken(endText);
    const end = current ? { year: now.getFullYear(), month: now.getMonth() + 1 } : parseYearMonth(endText);

    return {
      start,
      end,
      isCurrent: current,
      raw,
      parsed: Boolean(start) && Boolean(end),
    };
  }

  const single = parseYearMonth(normalized);
  if (!single) return empty;

  // A single year on its own: treat as that whole year.
  return {
    start: { year: single.year, month: 1 },
    end: { year: single.year, month: 12 },
    isCurrent: isPresentToken(normalized),
    raw,
    parsed: true,
  };
}

export function toMonths(value: YearMonth): number {
  return value.year * 12 + (value.month - 1);
}

export function monthsBetween(start: YearMonth, end: YearMonth): number {
  return Math.max(0, toMonths(end) - toMonths(start) + 1);
}

/** Merge overlapping/adjacent intervals so double-counted tenure is not inflated. */
export function mergeIntervals(
  intervals: Array<{ start: YearMonth; end: YearMonth }>,
): Array<{ start: YearMonth; end: YearMonth }> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => toMonths(a.start) - toMonths(b.start));
  const first = sorted[0] as { start: YearMonth; end: YearMonth };
  // Clone the seed interval: merging widens `end` in place, and the caller still needs
  // the original (unmerged) intervals to report how much tenure overlapped.
  const merged: Array<{ start: YearMonth; end: YearMonth }> = [
    { start: { ...first.start }, end: { ...first.end } },
  ];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i] as { start: YearMonth; end: YearMonth };
    const last = merged[merged.length - 1] as { start: YearMonth; end: YearMonth };
    if (toMonths(current.start) <= toMonths(last.end) + 1) {
      if (toMonths(current.end) > toMonths(last.end)) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export interface ComputeDurationOptions {
  now?: Date;
  /** Maximum plausible tenure, guards against typos like "199 - 2020". */
  maxMonths?: number;
}

/** Total professional months across all ranges, overlaps merged, nonsense filtered. */
export function computeTotalExperienceMonths(
  rangeTexts: Array<string | null | undefined>,
  options: ComputeDurationOptions = {},
): ExperienceDuration {
  const now = options.now ?? new Date();
  const maxMonths = options.maxMonths ?? 50 * 12;

  const ranges: DateRange[] = [];
  const unparsedRanges: string[] = [];
  const invalidRanges: string[] = [];
  const intervals: Array<{ start: YearMonth; end: YearMonth }> = [];

  for (const text of rangeTexts) {
    if (!text || !text.trim()) continue;
    const range = parseDateRange(text, now);
    ranges.push(range);

    if (!range.start || !range.end) {
      unparsedRanges.push(text);
      continue;
    }
    if (toMonths(range.end) < toMonths(range.start)) {
      invalidRanges.push(text);
      continue;
    }
    const months = monthsBetween(range.start, range.end);
    if (months > maxMonths || range.start.year < 1950 || range.end.year > now.getFullYear() + 1) {
      invalidRanges.push(text);
      continue;
    }
    intervals.push({ start: range.start, end: range.end });
  }

  const mergedIntervals = mergeIntervals(intervals);
  const mergedMonths = mergedIntervals.reduce(
    (total, interval) => total + monthsBetween(interval.start, interval.end),
    0,
  );
  const rawMonths = intervals.reduce(
    (total, interval) => total + monthsBetween(interval.start, interval.end),
    0,
  );

  return {
    totalMonths: mergedMonths,
    mergedIntervals,
    ranges,
    unparsedRanges,
    invalidRanges,
    overlapMonths: Math.max(0, rawMonths - mergedMonths),
  };
}

export function monthsToYears(months: number): number {
  return Math.round((months / 12) * 10) / 10;
}

/** Are ranges listed newest-first? Returns null when there is nothing to judge. */
export function isReverseChronological(
  rangeTexts: Array<string | null | undefined>,
  now: Date = new Date(),
): boolean | null {
  const starts = rangeTexts
    .map((text) => parseDateRange(text, now))
    .filter((range): range is DateRange & { start: YearMonth } => Boolean(range.start))
    .map((range) => toMonths(range.start));

  if (starts.length < 2) return null;
  for (let i = 1; i < starts.length; i += 1) {
    if ((starts[i] as number) > (starts[i - 1] as number)) return false;
  }
  return true;
}

export type DateFormatStyle =
  | 'MONTH_NAME_YEAR'   // Jan 2020 / January 2020
  | 'NUMERIC_MONTH_YEAR'// 01/2020
  | 'YEAR_MONTH'        // 2020-01
  | 'YEAR_ONLY'         // 2020
  | 'UNKNOWN';

export function detectDateFormatStyle(input: string | null | undefined): DateFormatStyle {
  if (!input) return 'UNKNOWN';
  const text = input.trim().toLowerCase();

  if (/\b(19|20)\d{2}\s*[-/]\s*(0?[1-9]|1[0-2])\b/.test(text)) return 'YEAR_MONTH';
  if (/\b(0?[1-9]|1[0-2])\s*[-/.]\s*(19|20)\d{2}\b/.test(text)) return 'NUMERIC_MONTH_YEAR';
  if (/\b[a-z]{3,9}\.?[\s,]+\d{2,4}\b/.test(text)) return 'MONTH_NAME_YEAR';
  if (/\b(19|20)\d{2}\b/.test(text)) return 'YEAR_ONLY';
  return 'UNKNOWN';
}

export interface DateFormatConsistency {
  uniform: boolean;
  dominant: DateFormatStyle;
  styles: Record<string, number>;
}

/** Structural-consistency signal: resumes should not mix "01/2020" and "Jan 2020". */
export function checkDateFormatConsistency(
  dateStrings: Array<string | null | undefined>,
): DateFormatConsistency {
  const styles: Record<string, number> = {};
  for (const value of dateStrings) {
    const style = detectDateFormatStyle(value);
    if (style === 'UNKNOWN') continue;
    styles[style] = (styles[style] ?? 0) + 1;
  }

  const entries = Object.entries(styles).sort((a, b) => b[1] - a[1]);
  const dominant = (entries[0]?.[0] as DateFormatStyle | undefined) ?? 'UNKNOWN';
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  const dominantShare = total === 0 ? 1 : (entries[0]?.[1] ?? 0) / total;

  return {
    uniform: dominantShare >= 0.8,
    dominant,
    styles,
  };
}

/** Detect impossible overlaps, e.g. two full-time roles listed as simultaneous. */
export function findOverlappingRanges(
  rangeTexts: Array<string | null | undefined>,
  now: Date = new Date(),
): Array<{ a: string; b: string; overlapMonths: number }> {
  const ranges = rangeTexts
    .filter((text): text is string => Boolean(text && text.trim()))
    .map((text) => ({ text, range: parseDateRange(text, now) }))
    .filter((entry) => entry.range.start && entry.range.end);

  const findings: Array<{ a: string; b: string; overlapMonths: number }> = [];

  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const first = ranges[i] as { text: string; range: DateRange };
      const second = ranges[j] as { text: string; range: DateRange };
      const startA = toMonths(first.range.start as YearMonth);
      const endA = toMonths(first.range.end as YearMonth);
      const startB = toMonths(second.range.start as YearMonth);
      const endB = toMonths(second.range.end as YearMonth);

      const overlapStart = Math.max(startA, startB);
      const overlapEnd = Math.min(endA, endB);
      if (overlapEnd >= overlapStart) {
        findings.push({
          a: first.text,
          b: second.text,
          overlapMonths: overlapEnd - overlapStart + 1,
        });
      }
    }
  }

  return findings;
}

export function formatYearMonth(value: YearMonth): string {
  return `${MONTH_LABELS[value.month - 1] ?? 'Jan'} ${value.year}`;
}
