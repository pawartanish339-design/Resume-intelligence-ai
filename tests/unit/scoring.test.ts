import { describe, expect, it } from 'vitest';

import { SCORE_COMPONENTS, WEIGHT_PROFILES, WEIGHT_PROFILE_IDS, sumWeights } from '@/lib/data/weight-profiles';
import { HARD_REQUIREMENT_CAP, computeScores, coverageScore, skillBlendScore } from '@/lib/services/scoring';
import type { ComponentScores, ScoreInput } from '@/lib/services/scoring';

function components(overrides: Partial<ComponentScores> = {}): ComponentScores {
  return {
    required_skills: 80,
    preferred_skills: 60,
    semantic_match: 75,
    experience_relevance: 70,
    ats_parseability: 90,
    content_quality: 65,
    achievements: 55,
    ...overrides,
  };
}

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    components: components(),
    weightProfile: 'software_engineer',
    counts: { requiredSkills: 5, preferredSkills: 2, responsibilities: 4 },
    unmetHardRequirement: false,
    ...overrides,
  };
}

describe('weight profiles', () => {
  it('sum to exactly 1.0000 for every profile', () => {
    for (const id of WEIGHT_PROFILE_IDS) {
      expect(sumWeights(WEIGHT_PROFILES[id].weights)).toBe(1);
      expect(Object.keys(WEIGHT_PROFILES[id].weights).sort()).toEqual([...SCORE_COMPONENTS].sort());
    }
  });

  it('documents why the profile exists and where it applies', () => {
    for (const id of WEIGHT_PROFILE_IDS) {
      expect(WEIGHT_PROFILES[id].label.length).toBeGreaterThan(0);
      expect(WEIGHT_PROFILES[id].description.length).toBeGreaterThan(20);
      expect(WEIGHT_PROFILES[id].titleKeywords.length).toBeGreaterThan(0);
    }
  });
});

describe('coverage scoring', () => {
  it('averages credits and clamps the result to 0-100', () => {
    expect(coverageScore([1, 1, 1])).toBe(100);
    expect(coverageScore([0, 0, 0])).toBe(0);
    expect(coverageScore([1, 0.85, 0.65])).toBeCloseTo(83.33, 1);
    // Above-1 credits cannot inflate a score.
    expect(coverageScore([1, 1, 5])).toBeCloseTo(100, 2);
  });

  it('is neutral for an empty preferred list and zero for an empty required list', () => {
    expect(coverageScore([], { neutralWhenEmpty: true })).toBe(70);
    expect(coverageScore([])).toBe(0);
  });

  it('blends required and preferred without letting an empty list drag the score down', () => {
    expect(skillBlendScore(80, 0, 0)).toBe(80);
    expect(skillBlendScore(100, 0, 2)).toBe(70);
    expect(skillBlendScore(80, 80, 3)).toBe(80);
  });
});

describe('computeScores', () => {
  it('produces every component detail with weights that sum to the profile total', () => {
    const { breakdown } = computeScores(input());

    for (const component of SCORE_COMPONENTS) {
      expect(breakdown.components[component].component).toBe(component);
      expect(breakdown.components[component].score).toBeGreaterThanOrEqual(0);
      expect(breakdown.components[component].score).toBeLessThanOrEqual(100);
    }

    expect(breakdown.weight_total).toBe(1);
    expect(breakdown.overall_score).toBeGreaterThan(0);
    expect(breakdown.overall_score).toBeLessThanOrEqual(100);
  });

  it('computes the overall score as the weight-dot-product, rounded to 2 decimals', () => {
    const { breakdown } = computeScores(input({ weightProfile: 'software_engineer' }));
    const weights = WEIGHT_PROFILES.software_engineer.weights;

    const expected =
      components().required_skills * weights.required_skills +
      components().preferred_skills * weights.preferred_skills +
      components().semantic_match * weights.semantic_match +
      components().experience_relevance * weights.experience_relevance +
      components().ats_parseability * weights.ats_parseability +
      components().content_quality * weights.content_quality +
      components().achievements * weights.achievements;

    expect(breakdown.overall_score).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });

  it('re-normalises the job-match score over only its four components', () => {
    const { breakdown } = computeScores(input());

    // With every component equal the renormalisation must equal the shared value.
    const flat = computeScores(
      input({
        components: components({
          required_skills: 70,
          preferred_skills: 70,
          semantic_match: 70,
          experience_relevance: 70,
          ats_parseability: 10,
          content_quality: 10,
          achievements: 10,
        }),
      }),
    );

    expect(flat.breakdown.job_match_score).toBeCloseTo(70, 1);
    expect(flat.breakdown.overall_score).toBeLessThan(70);
    // skill_score renormalises S1/S2 over the profile weights: 0.35/0.10 -> 77.8/22.2.
    const skillWeights = WEIGHT_PROFILES.software_engineer.weights;
    const expectedSkillScore =
      (skillWeights.required_skills * components().required_skills +
        skillWeights.preferred_skills * components().preferred_skills) /
      (skillWeights.required_skills + skillWeights.preferred_skills);

    expect(breakdown.skill_score).toBeCloseTo(expectedSkillScore, 2);
  });

  it('caps required-skill coverage when a hard requirement is unmet', () => {
    const { breakdown } = computeScores(
      input({
        components: components({ required_skills: 96 }),
        unmetHardRequirement: true,
        hardRequirementNote: 'Security clearance could not be verified.',
      }),
    );

    expect(breakdown.components.required_skills.score).toBe(HARD_REQUIREMENT_CAP);
    expect(breakdown.required_skills_capped).toBe(true);
    expect(breakdown.cap_reason).toContain('Security clearance');
  });

  it('never exceeds 100 even when every component is perfect', () => {
    const { breakdown, weightedTotal } = computeScores(
      input({
        components: components({
          required_skills: 100,
          preferred_skills: 100,
          semantic_match: 100,
          experience_relevance: 100,
          ats_parseability: 100,
          content_quality: 100,
          achievements: 100,
        }),
      }),
    );

    expect(breakdown.overall_score).toBe(100);
    expect(weightedTotal).toBe(100);
  });

  it('marks a component not applicable when the posting has nothing to evaluate', () => {
    const { breakdown } = computeScores(
      input({
        counts: { requiredSkills: 3, preferredSkills: 0, responsibilities: 0 },
        components: components({ preferred_skills: 70, semantic_match: 70 }),
      }),
    );

    expect(breakdown.components.preferred_skills.applicable).toBe(false);
    expect(breakdown.components.preferred_skills.detail).toContain('neutral');
    expect(breakdown.components.semantic_match.applicable).toBe(false);
    expect(breakdown.components.required_skills.applicable).toBe(true);
  });

  it('sanitises non-finite inputs to zero instead of propagating NaN or inflating a score', () => {
    const { breakdown } = computeScores(
      input({ components: components({ semantic_match: Number.NaN, achievements: Number.POSITIVE_INFINITY }) }),
    );

    // A non-finite value is treated as "unknown", never as a perfect score.
    expect(breakdown.components.semantic_match.score).toBe(0);
    expect(breakdown.components.achievements.score).toBe(0);
    expect(Number.isFinite(breakdown.overall_score)).toBe(true);
  });

  it('is deterministic across 100 identical runs', () => {
    const baseline = JSON.stringify(computeScores(input()).breakdown);
    for (let run = 0; run < 100; run += 1) {
      expect(JSON.stringify(computeScores(input()).breakdown)).toBe(baseline);
    }
  });
});
