import { describe, expect, it } from 'vitest';

import {
  computeScores,
  coverageScore,
  HARD_REQUIREMENT_CAP,
  NEUTRAL_COMPONENT_SCORE,
  scoreBand,
  SCORE_BAND_LABELS,
  skillBlendScore,
  type ComponentScores,
} from '@/lib/services/scoring';
import { listedInSkillsSection, findSkillEvidence } from '@/lib/services/evidence-lookup';
import { getWeightProfile } from '@/lib/data/weight-profiles';
import { makeResume } from '@/tests/helpers/factories';

const ROUND2 = (value: number) => Math.round(value * 100) / 100;

const COMPONENTS: ComponentScores = {
  required_skills: 80,
  preferred_skills: 60,
  semantic_match: 70,
  experience_relevance: 90,
  ats_parseability: 100,
  content_quality: 80,
  achievements: 50,
};

describe('coverageScore', () => {
  it('averages credits as a percentage', () => {
    expect(coverageScore([1, 0.5])).toBe(75);
    expect(coverageScore([1, 1, 0.85])).toBe(95);
    expect(coverageScore([0, 0, 0])).toBe(0);
  });

  it('clamps out-of-range credits instead of letting a single row distort coverage', () => {
    expect(coverageScore([2])).toBe(100);
    expect(coverageScore([-1, 1])).toBe(50);
  });

  it('distinguishes "nothing required" from "nothing preferred"', () => {
    expect(coverageScore([])).toBe(0);
    expect(coverageScore([], { neutralWhenEmpty: true })).toBe(NEUTRAL_COMPONENT_SCORE);
  });

  it('is deterministic for repeated calls with identical input', () => {
    const credits = [1, 0.85, 0.65, 0.25, 0];
    expect(coverageScore(credits)).toBe(coverageScore([...credits]));
  });
});

describe('skillBlendScore', () => {
  it('blends required and preferred 70/30 when preferred items exist', () => {
    expect(skillBlendScore(100, 0, 2)).toBe(70);
    expect(skillBlendScore(50, 100, 1)).toBe(65);
  });

  it('renormalises to required-only when the posting lists no preferred skills', () => {
    expect(skillBlendScore(80, 0, 0)).toBe(80);
    expect(skillBlendScore(100, 0, 0)).toBe(100);
  });
});

describe('computeScores', () => {
  it('reports the weight total so the maths is verifiable', () => {
    const { breakdown } = computeScores({
      components: COMPONENTS,
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: false,
    });

    expect(breakdown.weight_total).toBeCloseTo(1, 10);
    expect(breakdown.weight_profile).toBe('software_engineer');
    expect(breakdown.components.required_skills.weight).toBeCloseTo(0.35, 10);
  });

  it('computes the overall score as the weighted sum of all seven components', () => {
    const { breakdown, weightedTotal } = computeScores({
      components: COMPONENTS,
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: false,
    });

    const weights = getWeightProfile('software_engineer').weights;
    const expected = ROUND2(
      (Object.keys(COMPONENTS) as Array<keyof ComponentScores>).reduce(
        (total, component) => total + COMPONENTS[component] * weights[component],
        0,
      ),
    );

    expect(breakdown.overall_score).toBe(expected);
    expect(weightedTotal).toBe(expected);
  });

  it('renormalises the job match score over the four match components', () => {
    const { breakdown } = computeScores({
      components: COMPONENTS,
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: false,
    });

    const weights = getWeightProfile('software_engineer').weights;
    const numerator =
      COMPONENTS.required_skills * weights.required_skills +
      COMPONENTS.preferred_skills * weights.preferred_skills +
      COMPONENTS.semantic_match * weights.semantic_match +
      COMPONENTS.experience_relevance * weights.experience_relevance;
    const denominator =
      weights.required_skills +
      weights.preferred_skills +
      weights.semantic_match +
      weights.experience_relevance;

    expect(breakdown.job_match_score).toBe(ROUND2(numerator / denominator));
    expect(breakdown.job_match_score).toBeGreaterThanOrEqual(
      Math.min(
        COMPONENTS.required_skills,
        COMPONENTS.preferred_skills,
        COMPONENTS.semantic_match,
        COMPONENTS.experience_relevance,
      ),
    );
  });

  it('renormalises the skill score over the two skill components', () => {
    const { breakdown } = computeScores({
      components: COMPONENTS,
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: false,
    });

    const weights = getWeightProfile('software_engineer').weights;
    expect(breakdown.skill_score).toBe(
      ROUND2(
        (COMPONENTS.required_skills * weights.required_skills +
          COMPONENTS.preferred_skills * weights.preferred_skills) /
          (weights.required_skills + weights.preferred_skills),
      ),
    );
  });

  it('caps required-skill coverage when a hard requirement is unverified', () => {
    const uncapped = computeScores({
      components: { ...COMPONENTS, required_skills: 95 },
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: false,
    });
    const capped = computeScores({
      components: { ...COMPONENTS, required_skills: 95 },
      weightProfile: 'software_engineer',
      counts: { requiredSkills: 3, preferredSkills: 2, responsibilities: 3 },
      unmetHardRequirement: true,
    });

    expect(uncapped.breakdown.components.required_skills.score).toBe(95);
    expect(capped.breakdown.components.required_skills.score).toBe(HARD_REQUIREMENT_CAP);
    expect(capped.breakdown.required_skills_capped).toBe(true);
    expect(capped.breakdown.cap_reason).toBeTruthy();
    expect(capped.breakdown.overall_score).toBeLessThan(uncapped.breakdown.overall_score);
  });

  it('never exceeds 100 even when every component is perfect', () => {
    const { breakdown } = computeScores({
      components: {
        required_skills: 100,
        preferred_skills: 100,
        semantic_match: 100,
        experience_relevance: 100,
        ats_parseability: 100,
        content_quality: 100,
        achievements: 100,
      },
      weightProfile: 'product_manager',
      counts: { requiredSkills: 1, preferredSkills: 1, responsibilities: 1 },
      unmetHardRequirement: false,
    });

    expect(breakdown.overall_score).toBe(100);
    expect(breakdown.job_match_score).toBe(100);
    expect(breakdown.skill_score).toBe(100);
  });

  it('marks the preferred-skills component not applicable when the posting lists none', () => {
    const { breakdown } = computeScores({
      components: COMPONENTS,
      weightProfile: 'data_analyst',
      counts: { requiredSkills: 2, preferredSkills: 0, responsibilities: 2 },
      unmetHardRequirement: false,
    });

    expect(breakdown.components.preferred_skills.applicable).toBe(false);
    expect(breakdown.components.preferred_skills.detail).toContain('neutral');
    expect(breakdown.components.required_skills.applicable).toBe(true);
  });

  it('maps scores to the four documented bands', () => {
    expect(scoreBand(95)).toBe('excellent');
    expect(scoreBand(85)).toBe('excellent');
    expect(scoreBand(70)).toBe('strong');
    expect(scoreBand(50)).toBe('moderate');
    expect(scoreBand(49.99)).toBe('developing');
    expect(SCORE_BAND_LABELS.excellent).toBeTruthy();
    expect(SCORE_BAND_LABELS.developing).toBeTruthy();
  });
});

describe('evidence lookup feeds the report without inventing anything', () => {
  const resume = makeResume();

  it('finds verbatim bullets for a demonstrated skill', () => {
    const evidence = findSkillEvidence(resume, 'PostgreSQL', 2);

    expect(evidence.length).toBeGreaterThan(0);
    for (const ref of evidence) {
      expect(ref.snippet.length).toBeGreaterThan(0);
      expect(['experience', 'project', 'summary', 'achievement', 'certification', 'skills']).toContain(
        ref.origin,
      );
    }
    expect(evidence.some((ref) => /ledger|PostgreSQL/.test(ref.snippet))).toBe(true);
  });

  it('returns an empty list for a skill the resume never mentions', () => {
    expect(findSkillEvidence(resume, 'Solidity')).toEqual([]);
  });

  it('distinguishes "listed in the skills section" from "demonstrated"', () => {
    expect(listedInSkillsSection(resume, 'Redis')).toBe(true);
    expect(listedInSkillsSection(resume, 'Solidity')).toBe(false);
  });

  it('respects the requested limit', () => {
    expect(findSkillEvidence(resume, 'TypeScript', 1).length).toBeLessThanOrEqual(1);
  });
});
