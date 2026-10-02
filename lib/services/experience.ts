import type { CanonicalJD, CanonicalResume } from '@/lib/ai/schemas';
import { clamp, roundTo } from '@/lib/utils/cache';
import { computeTotalExperienceMonths, monthsToYears } from '@/lib/utils/dates';
import type { ExperienceReport } from '@/types/analysis';

/**
 * Experience relevance (S4).
 *
 *   S_exp = 0.35 * yearsScore + 0.65 * relevanceScore
 *
 * - `yearsScore` compares merged professional tenure against the JD's stated
 *   minimum. When the JD does not state one, a neutral 70 is used so the component
 *   neither rewards nor punishes the candidate.
 * - `relevanceScore` is derived from embedding similarities between JD
 *   responsibilities and the candidate's experience/project bullets, mapped
 *   through the shared similarity thresholds. It is computed by the pipeline (the
 *   only place that performs I/O) and passed in.
 * - Entry-level JDs (intern/entry/junior/graduate or <= 1 year required) treat
 *   projects as equivalent to experience, which is the fairer comparison.
 */

export const NEUTRAL_YEAR_SCORE = 70;
export const NEUTRAL_RELEVANCE_SCORE = 70;

export interface ExperienceInput {
  resume: CanonicalResume;
  jobDescription: Pick<CanonicalJD, 'requirements' | 'meta'>;
  /** Best cosine similarity per JD responsibility (0..1). Empty -> neutral. */
  responsibilitySimilarities: number[];
  /** Optional: similarity of JD responsibilities against project bullets only. */
  projectSimilarities?: number[];
}

const ENTRY_LEVEL_TOKENS = [
  'intern', 'internship', 'entry', 'entry-level', 'junior', 'graduate', 'grad', 'trainee',
  'apprentice', 'associate', 'student', 'no experience',
];

export function isEntryLevelJd(jobDescription: Pick<CanonicalJD, 'requirements' | 'meta'>): boolean {
  const seniority = (jobDescription.meta?.seniority_level ?? '').toLowerCase();
  if (ENTRY_LEVEL_TOKENS.some((token) => seniority.includes(token))) return true;

  const minYears = jobDescription.requirements?.min_years_experience;
  if (typeof minYears === 'number' && minYears <= 1) return true;

  const educationLevels = (jobDescription.requirements?.education_level ?? []).join(' ').toLowerCase();
  if (educationLevels.includes('student') || educationLevels.includes('intern')) return true;

  return false;
}

/** Map a 0..1 cosine similarity to a 0..100 relevance score using shared bands. */
export function similarityToRelevanceScore(similarity: number): number {
  if (similarity >= 0.82) return 100;
  if (similarity >= 0.72) return 65;
  if (similarity >= 0.6) return 25;
  return 0;
}

/**
 * Mean of the top-k similarities (k = ceil(n/2), at least 1). Averaging only the
 * best matches avoids punishing a candidate for responsibilities that are clearly
 * outside a single person's remit.
 */
export function topKMeanScore(similarities: number[]): number {
  const usable = similarities.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => b - a);
  if (usable.length === 0) return NEUTRAL_RELEVANCE_SCORE;

  const k = Math.max(1, Math.ceil(usable.length / 2));
  const top = usable.slice(0, k);
  const mean = top.reduce((total, value) => total + value, 0) / top.length;
  return roundTo(clamp(similarityToRelevanceScore(mean), 0, 100), 2);
}

export function yearsScoreFor(totalMonths: number, minYearsRequired: number | null): number {
  const totalYears = totalMonths / 12;

  if (minYearsRequired === null || !Number.isFinite(minYearsRequired)) {
    return totalMonths > 0 ? NEUTRAL_YEAR_SCORE : 50;
  }
  if (minYearsRequired <= 0) return 100;

  const ratio = totalYears / minYearsRequired;
  if (ratio >= 1) return 100;

  // Partial credit ramps linearly, with a floor so short-but-relevant tenure is
  // not scored as zero.
  return roundTo(clamp(Math.max(30, ratio * 100), 0, 100), 2);
}

export function analyzeExperience(input: ExperienceInput): ExperienceReport {
  const findings: string[] = [];
  const { resume, jobDescription } = input;

  const rangeTexts = (resume.experience ?? [])
    .map((job) => [job.start_date, job.end_date].filter(Boolean).join(' - '))
    .filter((range) => range.trim().length > 0);

  const duration = computeTotalExperienceMonths(rangeTexts);
  const totalYears = monthsToYears(duration.totalMonths);
  const minYearsRequired = jobDescription.requirements?.min_years_experience ?? null;
  const entryLevel = isEntryLevelJd(jobDescription);

  const yearsScore = yearsScoreFor(duration.totalMonths, minYearsRequired);

  // Relevance: experiences first; entry-level postings give projects equal weight.
  const experienceSimilarities = input.responsibilitySimilarities ?? [];
  const projectSimilarities = input.projectSimilarities ?? experienceSimilarities;
  const combinedSimilarities = entryLevel
    ? [...experienceSimilarities, ...projectSimilarities]
    : experienceSimilarities;

  const relevanceScore = topKMeanScore(combinedSimilarities);

  if (minYearsRequired !== null) {
    if (totalYears >= minYearsRequired) {
      findings.push(
        `About ${totalYears} years of documented experience meets the stated minimum of ${minYearsRequired} year(s).`,
      );
    } else {
      findings.push(
        `About ${totalYears} years of documented experience is below the stated minimum of ${minYearsRequired} year(s). Relevant projects, coursework, or adjacent roles can still demonstrate capability.`,
      );
    }
  } else {
    findings.push('The posting does not state a minimum number of years, so tenure was scored neutrally.');
  }

  if (entryLevel) {
    findings.push('This posting looks entry-level or internship-oriented, so project work carries the same weight as employment.');
  }

  if (rangeTexts.length === 0) {
    findings.push('No dated experience entries were found; tenure could not be measured.');
  }

  if (duration.overlapMonths >= 6) {
    findings.push(
      `Overlapping roles were merged for tenure maths (${duration.overlapMonths} overlapping months were not double-counted).`,
    );
  }

  const score = roundTo(clamp(0.35 * yearsScore + 0.65 * relevanceScore, 0, 100), 2);

  return {
    total_months: duration.totalMonths,
    total_years: totalYears,
    years_score: roundTo(yearsScore, 2),
    relevance_score: relevanceScore,
    score,
    min_years_required: minYearsRequired,
    entry_level_mode: entryLevel,
    findings,
  };
}
