import type { CanonicalResume } from '@/lib/ai/schemas';
import { classifyBulletOpener } from '@/lib/data/action-verbs';
import { clamp, roundTo } from '@/lib/utils/cache';
import {
  bulletLengthStats,
  readability,
  readabilityToScore,
  type BulletLengthStats,
  type ReadabilityScores,
} from '@/lib/utils/readability';
import {
  checkDateFormatConsistency,
  computeTotalExperienceMonths,
  findOverlappingRanges,
  isReverseChronological,
} from '@/lib/utils/dates';
import type { QualityReport } from '@/types/analysis';

/**
 * Content quality analysis (S6 and the separate achievements index S7).
 *
 * All inputs come from the parsed resume only -- the job description plays no part
 * here, so this measures craft (action verbs, quantified impact, structure,
 * readability), not fit.
 */

/** Impact patterns: percentages, currency+scale, multipliers, and scale words. */
export const QUANTIFICATION_PATTERNS: ReadonlyArray<RegExp> = [
  /\d+(?:\.\d+)?\s?%/,
  /\$\s?\d[\d,.]*\s?(?:[kKmMbB]|million|billion|thousand)?/,
  /\b\d+(?:\.\d+)?\s?x\b/i,
  /\b\d[\d,.]*\s?(?:users|customers|clients|accounts|requests|transactions|records|rows|documents|tickets|calls|leads|downloads|installs|signups|subscribers|employees|engineers|people|members|patients|students|hours|days|weeks|months|minutes|seconds|ms|milliseconds|tb|gb|pb|mb|kb|fps|qps|rps|rpm|tps)\b/i,
  /\b(?:reduced|increased|improved|cut|grew|boosted|saved|accelerated|decreased)\b[^.\n]{0,40}\b\d/i,
  /\b\d+(?:\.\d+)?\s?(?:percent|percentage points)\b/i,
];

export function isQuantifiedBullet(bullet: string): boolean {
  return QUANTIFICATION_PATTERNS.some((pattern) => pattern.test(bullet));
}

/** Bullets to evaluate: experience bullets plus project bullets. */
export function collectBullets(resume: CanonicalResume): string[] {
  const bullets: string[] = [];
  for (const job of resume.experience ?? []) {
    for (const bullet of job.bullet_points ?? []) {
      if (bullet.trim().length > 0) bullets.push(bullet.trim());
    }
  }
  for (const project of resume.projects ?? []) {
    for (const bullet of project.bullet_points ?? []) {
      if (bullet.trim().length > 0) bullets.push(bullet.trim());
    }
  }
  return bullets;
}

export function actionVerbDensity(bullets: string[]): number {
  if (bullets.length === 0) return 0;
  const strong = bullets.filter((bullet) => classifyBulletOpener(bullet) === 'strong').length;
  return strong / bullets.length;
}

/**
 * Achievements index (S7): share of bullets carrying a numeric metric, scaled so
 * that ~50% quantified bullets scores 100 (and more than that is capped).
 */
export function achievementsIndex(bullets: string[]): number {
  if (bullets.length === 0) return 0;
  const quantified = bullets.filter(isQuantifiedBullet).length;
  const ratio = quantified / bullets.length;
  return roundTo(clamp(ratio * 200, 0, 100), 2);
}

export interface StructureAssessment {
  score: number;
  findings: string[];
  dateFormatUniform: boolean;
  reverseChronological: boolean | null;
}

/** Structural consistency: consistent date style, newest-first, no impossible overlaps. */
export function assessStructure(resume: CanonicalResume): StructureAssessment {
  const findings: string[] = [];

  const experienceDates = (resume.experience ?? [])
    .flatMap((job) => [job.start_date, job.end_date])
    .filter((value): value is string => Boolean(value));
  const educationDates = (resume.education ?? [])
    .flatMap((entry) => [entry.start_date, entry.end_date])
    .filter((value): value is string => Boolean(value));

  const experienceConsistency = checkDateFormatConsistency(experienceDates);
  const educationConsistency = checkDateFormatConsistency(educationDates);
  const dateFormatUniform =
    (experienceDates.length < 4 || experienceConsistency.uniform) &&
    (educationDates.length < 4 || educationConsistency.uniform);

  if (!dateFormatUniform) {
    findings.push(
      `Inconsistent date formats detected (${Object.keys({ ...experienceConsistency.styles, ...educationConsistency.styles }).join(', ')}). Use one style throughout, for example "Jan 2022 - Present".`,
    );
  }

  const dateRanges = (resume.experience ?? [])
    .map((job) => [job.start_date, job.end_date].filter(Boolean).join(' - '))
    .filter((range) => range.trim().length > 0);

  const reverseChronological = isReverseChronological(dateRanges);
  if (reverseChronological === false) {
    findings.push('Experience entries are not in reverse-chronological order (most recent first).');
  }

  const overlaps = findOverlappingRanges(dateRanges).filter((overlap) => overlap.overlapMonths >= 2);
  if (overlaps.length > 0) {
    findings.push(
      `${overlaps.length} pair(s) of roles overlap in time. Concurrent roles are fine if intentional, but overlapping "full-time" dates can look like an error.`,
    );
  }

  const duration = computeTotalExperienceMonths(dateRanges);
  if (duration.unparsedRanges.length > 0) {
    findings.push(
      `${duration.unparsedRanges.length} date range(s) could not be parsed: ${duration.unparsedRanges.slice(0, 3).join('; ')}.`,
    );
  }
  if (duration.invalidRanges.length > 0) {
    findings.push(
      `${duration.invalidRanges.length} date range(s) look impossible (end before start, or implausible): ${duration.invalidRanges.slice(0, 3).join('; ')}.`,
    );
  }

  let score = 100;
  if (!dateFormatUniform) score -= 15;
  if (reverseChronological === false) score -= 15;
  if (overlaps.length > 0) score -= Math.min(15, overlaps.length * 5);
  if (duration.unparsedRanges.length > 0) score -= Math.min(20, duration.unparsedRanges.length * 5);
  if (duration.invalidRanges.length > 0) score -= Math.min(30, duration.invalidRanges.length * 10);

  return {
    score: roundTo(clamp(score, 0, 100), 2),
    findings,
    dateFormatUniform,
    reverseChronological,
  };
}

function bulletLengthFit(stats: BulletLengthStats): number {
  if (stats.count === 0) return 0;
  return roundTo(clamp(stats.withinIdealBand * 100, 0, 100), 2);
}

export function analyzeQuality(resume: CanonicalResume): QualityReport {
  const bullets = collectBullets(resume);
  const findings: string[] = [];

  const verbDensity = actionVerbDensity(bullets);
  const verbsScore = roundTo(clamp(verbDensity * 100, 0, 100), 2);

  if (bullets.length > 0 && verbDensity < 0.6) {
    findings.push(
      `Only ${Math.round(verbDensity * 100)}% of bullets start with a strong action verb. Open with verbs such as "Built", "Reduced", "Led", "Automated".`,
    );
  }

  const passiveOpeners = bullets
    .filter((bullet) => classifyBulletOpener(bullet) === 'passive')
    .slice(0, 8);
  if (passiveOpeners.length > 0) {
    findings.push(`${passiveOpeners.length} bullet(s) start passively, for example: "${passiveOpeners[0]}".`);
  }

  const structure = assessStructure(resume);
  findings.push(...structure.findings);

  const bulletText = bullets.join('. ');
  const readabilityScores: ReadabilityScores = readability(bulletText);
  const readabilityScore = bulletText.length > 40 ? readabilityToScore(readabilityScores.fleschReadingEase) : 60;

  if (bulletText.length > 40 && readabilityScores.avgWordsPerSentence > 34) {
    findings.push(
      `Bullets average ${readabilityScores.avgWordsPerSentence} words. Splitting them into shorter statements improves scan-ability.`,
    );
  }

  const lengthStats = bulletLengthStats(bullets);
  const lengthFit = bulletLengthFit(lengthStats);
  if (lengthStats.count > 0 && lengthFit < 60) {
    findings.push(
      `Only ${Math.round(lengthStats.withinIdealBand * 100)}% of bullets fall in the 12-28 word range (average ${lengthStats.avgWords}).`,
    );
  }

  const achievements = achievementsIndex(bullets);
  if (bullets.length > 0 && achievements < 60) {
    findings.push(
      `About ${Math.round((achievements / 200) * 100)}% of bullets include a measurable outcome. Add scope, scale, or percentage impact where it is truthful.`,
    );
  }

  const score = roundTo(
    0.4 * verbsScore + 0.25 * structure.score + 0.2 * readabilityScore + 0.15 * lengthFit,
    2,
  );

  if (bullets.length === 0) {
    findings.push(
      'No experience or project bullet points were found. Add achievement lines under each role so content quality can be evaluated.',
    );
  }

  return {
    score: clamp(score, 0, 100),
    action_verb_density: verbsScore,
    quantified_bullet_ratio: bullets.length === 0 ? 0 : roundTo((bullets.filter(isQuantifiedBullet).length / bullets.length) * 100, 2),
    achievements_index: achievements,
    structure_score: structure.score,
    readability_score: roundTo(readabilityScore, 2),
    bullet_length_fit: lengthFit,
    bullet_count: bullets.length,
    passive_openers: passiveOpeners,
    findings,
    flesch_reading_ease: readabilityScores.fleschReadingEase,
    flesch_kincaid_grade: readabilityScores.fleschKincaidGrade,
    date_format_uniform: structure.dateFormatUniform,
    reverse_chronological: structure.reverseChronological,
    date_findings: structure.findings,
  };
}
