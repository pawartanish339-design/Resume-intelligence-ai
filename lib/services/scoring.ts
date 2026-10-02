import {
  SCORE_COMPONENTS,
  getWeightProfile,
  renormalizedWeights,
  sumWeights,
  type ScoreComponent,
  type WeightProfileId,
  type WeightVector,
} from '@/lib/data/weight-profiles';
import { clamp, roundTo } from '@/lib/utils/cache';
import type { ScoreBreakdown, ScoreComponentDetail } from '@/types/analysis';

/**
 * Final scoring (PURE -- no I/O, no Date.now(), no randomness).
 *
 *   S_overall = min(100, sum(w_k * S_k)), k = 1..7
 *
 * Inputs are the seven component scores (0-100). Identical inputs must always
 * produce identical outputs; tests run the function 100 times and assert zero
 * variance, and every weight profile is asserted to sum to exactly 1.00.
 */

export const COMPONENT_LABELS: Record<ScoreComponent, string> = {
  required_skills: 'Required Skill Coverage',
  preferred_skills: 'Preferred Skill Coverage',
  semantic_match: 'Semantic Alignment',
  experience_relevance: 'Experience Relevance',
  ats_parseability: 'ATS Parseability',
  content_quality: 'Content Quality',
  achievements: 'Achievements Index',
};

/** Neutral score used when a component has nothing to evaluate. */
export const NEUTRAL_COMPONENT_SCORE = 70;

/** Cap applied to required-skill coverage when a hard requirement is unmet. */
export const HARD_REQUIREMENT_CAP = 70;

export interface ComponentScores {
  required_skills: number;
  preferred_skills: number;
  semantic_match: number;
  experience_relevance: number;
  ats_parseability: number;
  content_quality: number;
  achievements: number;
}

export interface ScoreInput {
  components: ComponentScores;
  weightProfile: WeightProfileId;
  /** Coverage denominators, used for the "applicable" flags + details. */
  counts: {
    requiredSkills: number;
    preferredSkills: number;
    responsibilities: number;
  };
  /** True when at least one hard requirement could not be verified. */
  unmetHardRequirement: boolean;
  hardRequirementNote?: string | null;
  /** Optional per-component explanations surfaced in the UI. */
  details?: Partial<Record<ScoreComponent, string>>;
}

function sanitizeScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return roundTo(clamp(value, 0, 100), 2);
}

/**
 * Skill coverage = (sum of credits / number of skills) * 100.
 * With no skills to evaluate the component is "not applicable": preferred skills
 * fall back to a neutral 70 (and are marked not-applicable in the UI), while
 * required skills report 0 because a posting with no requirements cannot be met
 * by definition -- callers normally guard this case before it is reached.
 */
export function coverageScore(credits: number[], options: { neutralWhenEmpty?: boolean } = {}): number {
  if (credits.length === 0) {
    return options.neutralWhenEmpty ? NEUTRAL_COMPONENT_SCORE : 0;
  }
  const total = credits.reduce((sum, credit) => sum + clamp(credit, 0, 1), 0);
  return sanitizeScore((total / credits.length) * 100);
}

/** Blend of required (0.7) and preferred (0.3) coverage, renormalised when empty. */
export function skillBlendScore(requiredScore: number, preferredScore: number, preferredSkillsCount: number): number {
  if (preferredSkillsCount === 0) return sanitizeScore(requiredScore);
  return sanitizeScore(0.7 * requiredScore + 0.3 * preferredScore);
}

export interface ScoreResult {
  breakdown: ScoreBreakdown;
  weightedTotal: number;
}

/**
 * Compute the full breakdown. `job_match_score` blends S1-S4 with renormalised
 * weights; `skill_score` blends S1/S2 with renormalised weights.
 */
export function computeScores(input: ScoreInput): ScoreResult {
  const profile = getWeightProfile(input.weightProfile);
  const weights: WeightVector = profile.weights;

  const weightTotal = sumWeights(weights);
  if (weightTotal !== 1) {
    throw new Error(
      `Weight profile "${profile.id}" must sum to 1.00 but sums to ${weightTotal}.`,
    );
  }

  const cappedRequired = input.unmetHardRequirement
    ? Math.min(input.components.required_skills, HARD_REQUIREMENT_CAP)
    : input.components.required_skills;

  const scores: ComponentScores = {
    ...input.components,
    required_skills: cappedRequired,
  };

  const components = {} as Record<ScoreComponent, ScoreComponentDetail>;
  let weightedTotal = 0;

  for (const component of SCORE_COMPONENTS) {
    const score = sanitizeScore(scores[component]);
    const weight = weights[component];
    const weighted = roundTo(score * weight, 4);
    weightedTotal += weighted;

    const applicable =
      component === 'required_skills'
        ? input.counts.requiredSkills > 0
        : component === 'preferred_skills'
          ? input.counts.preferredSkills > 0
          : component === 'semantic_match'
            ? input.counts.responsibilities > 0
            : true;

    const note =
      input.details?.[component] ??
      (component === 'required_skills' && input.unmetHardRequirement
        ? (input.hardRequirementNote ??
          'Required skill coverage is capped because a non-negotiable requirement could not be verified from your document.')
        : component === 'preferred_skills' && !applicable
          ? 'The posting lists no preferred skills, so this component is neutral.'
          : '');

    components[component] = {
      component,
      label: COMPONENT_LABELS[component],
      score,
      weight,
      weighted_score: weighted,
      applicable,
      detail: note,
    };
  }

  const overall = roundTo(clamp(weightedTotal, 0, 100), 2);

  const jobMatchWeights = renormalizedWeights(weights, [
    'required_skills',
    'preferred_skills',
    'semantic_match',
    'experience_relevance',
  ]);
  const jobMatch = roundTo(
    clamp(
      SCORE_COMPONENTS.reduce((total, component) => total + scores[component] * jobMatchWeights[component], 0),
      0,
      100,
    ),
    2,
  );

  const skillWeights = renormalizedWeights(weights, ['required_skills', 'preferred_skills']);
  const skillScore = roundTo(
    clamp(
      SCORE_COMPONENTS.reduce((total, component) => total + scores[component] * skillWeights[component], 0),
      0,
      100,
    ),
    2,
  );

  const capped = input.unmetHardRequirement && input.components.required_skills > HARD_REQUIREMENT_CAP;

  return {
    weightedTotal: overall,
    breakdown: {
      overall_score: overall,
      job_match_score: jobMatch,
      ats_score: components.ats_parseability.score,
      skill_score: skillScore,
      weight_profile: profile.id,
      components,
      required_skills_capped: input.unmetHardRequirement,
      cap_reason: input.unmetHardRequirement
        ? (input.hardRequirementNote ??
          'At least one non-negotiable requirement could not be verified from your document, so required-skill coverage is capped.')
        : null,
      weight_total: weightTotal,
      ...(capped ? {} : {}),
    },
  };
}

/** Score bands used for colour coding and labels in the UI. */
export function scoreBand(score: number): 'excellent' | 'strong' | 'moderate' | 'developing' {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'moderate';
  return 'developing';
}

export const SCORE_BAND_LABELS: Record<ReturnType<typeof scoreBand>, string> = {
  excellent: 'Excellent alignment',
  strong: 'Strong alignment',
  moderate: 'Moderate alignment',
  developing: 'Developing alignment',
};
