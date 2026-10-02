import { describe, expect, it } from 'vitest';

import {
  buildRecommendationFacts,
  buildTemplateRecommendation,
  checkRecommendation,
  extractQuotedPassages,
  FORBIDDEN_RECOMMENDATION_PATTERNS,
  MAX_LLM_RECOMMENDATIONS,
  requirementSourceLabel,
} from '@/lib/ai/recommend';
import { isGroundedIn } from '@/lib/ai/safety';
import type { LlmRecommendation } from '@/lib/ai/schemas';
import type { SkillGapItem } from '@/types/analysis';
import { buildSkillGaps } from '@/lib/services/gaps';
import { makeResume } from '@/tests/helpers/factories';

const JD_TEXT = [
  'About the role',
  'We are hiring a Senior Backend Engineer.',
  '',
  'Requirements',
  'TypeScript experience is required for this role.',
  'Experience with Kubernetes is a nice to have.',
].join('\n');

const RESUME = makeResume();

const RESUME_TEXT = [
  RESUME.summary,
  ...RESUME.experience.flatMap((role) => [role.title, role.company, ...role.bullet_points]),
  ...RESUME.projects.flatMap((project) => [project.title, project.description, ...project.bullet_points]),
].join('\n');

function makeGap(overrides: Partial<SkillGapItem> = {}): SkillGapItem {
  const base: SkillGapItem = {
    skill: 'TypeScript',
    canonical: 'TypeScript',
    category: 'MISSING_REQ',
    source: 'required',
    priority: 'high',
    jd_excerpt: 'TypeScript experience is required for this role.',
    jd_line: 5,
    jd_section: 'Requirements',
    related_assets: ['Docker'],
    implicit_evidence: null,
    detection_result:
      'Not found in your document (no keyword, alias, related skill, or sufficiently similar content). This is a required item in the posting.',
  };

  return { ...base, ...overrides };
}

function makeOutput(overrides: Partial<LlmRecommendation> = {}): LlmRecommendation {
  const base: LlmRecommendation = {
    requirement_excerpt: 'TypeScript experience is required for this role.',
    detection_result: 'The posting lists TypeScript as required; it was not found in your document.',
    related_assets: ['Docker'],
    recommended_action:
      'If you have hands-on TypeScript work, describe the project, the environment, and the measurable outcome in one bullet.',
  };

  return { ...base, ...overrides };
}

describe('deterministic template recommendations', () => {
  it('never suggests claiming a skill the candidate may not have', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);
    const template = buildTemplateRecommendation(facts);

    expect(template.recommended_action).toContain('If you have hands-on experience');
    expect(template.recommended_action).toContain('Docker');
    expect(template.recommended_action).toContain('If you do not have such experience');
    expect(template.recommended_action.toLowerCase()).not.toContain('add "typescript"');
    expect(checkRecommendation({ ...makeOutput(), ...template }, facts).ok).toBe(true);
  });

  it('states the no-fabrication policy outright when there is nothing adjacent to point at', () => {
    const facts = buildRecommendationFacts(makeGap({ related_assets: [] }), JD_TEXT, RESUME_TEXT);
    const template = buildTemplateRecommendation(facts);

    expect(template.recommended_action).toContain('If you have hands-on experience');
    expect(template.recommended_action).toContain('this analysis will never suggest claiming a skill');
  });

  it('adapts guidance for skills that are listed but not demonstrated', () => {
    const facts = buildRecommendationFacts(
      makeGap({
        skill: 'Redis',
        category: 'MENTIONED_WITHOUT_EVIDENCE',
        source: 'preferred',
        priority: 'medium',
      }),
      JD_TEXT,
      RESUME_TEXT,
    );
    const template = buildTemplateRecommendation(facts);

    expect(template.recommended_action).toContain('more convincing than adding the term to your skills list');
  });

  it('is stable: identical facts produce identical prose', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);
    expect(buildTemplateRecommendation(facts)).toEqual(buildTemplateRecommendation(facts));
  });
});

describe('ethics post-filter', () => {
  it('rejects instructions to add skills that were not demonstrated', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);

    const cases: Array<{ name: string; output: LlmRecommendation }> = [
      {
        name: 'add_skill_instruction',
        output: makeOutput({ recommended_action: 'Add "Kubernetes" to your skills section today.' }),
      },
      {
        name: 'include_skill_instruction',
        output: makeOutput({ recommended_action: 'Include "Terraform" in your resume to match the posting.' }),
      },
      {
        name: 'claim_skill_instruction',
        output: makeOutput({ recommended_action: 'Claim that you have TypeScript experience in the summary.' }),
      },
      {
        name: 'score_gaming',
        output: makeOutput({ recommended_action: 'This will boost your score by a lot, so reword the bullet.' }),
      },
      {
        name: 'points_or_percentage',
        output: makeOutput({ recommended_action: 'Following this adds 12 points to the compatibility score.' }),
      },
      {
        name: 'keyword_stuffing',
        output: makeOutput({ recommended_action: 'Stuff the keywords into the skills list.' }),
      },
      {
        name: 'fabrication',
        output: makeOutput({ recommended_action: 'Do not fabricate experience, but exaggerate slightly.' }),
      },
      {
        name: 'guarantee',
        output: makeOutput({ recommended_action: 'This change guarantees you an interview with the hiring team.' }),
      },
    ];

    for (const { name, output } of cases) {
      const check = checkRecommendation(output, facts);
      expect(check.ok, `${name} should be rejected`).toBe(false);
      expect(check.reason).toBe(`forbidden_pattern:${name}`);
    }

    expect(FORBIDDEN_RECOMMENDATION_PATTERNS.map((pattern) => pattern.name)).toEqual(
      cases.map((entry) => entry.name),
    );
  });

  it('rejects quotes that are not verbatim in either document', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);

    const check = checkRecommendation(
      makeOutput({ recommended_action: 'They ask for "Kubernetes at production scale" — mention that.' }),
      facts,
    );

    expect(check.ok).toBe(false);
    expect(check.reason).toBe('quoted_text_not_grounded');
  });

  it('rejects a requirement excerpt the posting does not contain', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);

    const check = checkRecommendation(makeOutput({ requirement_excerpt: 'Must know Rust and Go deeply.' }), facts);

    expect(check.ok).toBe(false);
    expect(check.reason).toBe('requirement_excerpt_not_grounded');
  });

  it('rejects related assets that are not in the resume or the verified facts', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);

    const check = checkRecommendation(makeOutput({ related_assets: ['Kafka Streams Platform'] }), facts);

    expect(check.ok).toBe(false);
    expect(check.reason).toBe('unverified_related_asset');
  });

  it('rejects an action that is too short to be useful', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);
    const check = checkRecommendation(makeOutput({ recommended_action: 'Learn TypeScript.' }), facts);

    expect(check.ok).toBe(false);
    expect(check.reason).toBe('action_too_short');
  });

  it('accepts a grounded, conditional recommendation', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);
    const check = checkRecommendation(makeOutput(), facts);

    expect(check).toEqual({ ok: true, reason: null });
  });

  it('caps how many recommendations may be LLM-written', () => {
    expect(MAX_LLM_RECOMMENDATIONS).toBeGreaterThan(0);
    expect(MAX_LLM_RECOMMENDATIONS).toBeLessThanOrEqual(10);
  });
});

describe('quote extraction', () => {
  it('collects quoted passages long enough to verify', () => {
    const passages = extractQuotedPassages(
      'They ask for "TypeScript experience" and “PostgreSQL ledger design” but not "short".',
    );

    expect(passages).toEqual(['TypeScript experience', 'PostgreSQL ledger design']);
  });

  it('only accepts substrings of the source text', () => {
    expect(isGroundedIn('TypeScript experience is required for this role.', JD_TEXT)).toBe(true);
    expect(isGroundedIn('Rust experience is required for this role.', JD_TEXT)).toBe(false);
    expect(isGroundedIn('', JD_TEXT)).toBe(false);
  });
});

describe('no recommendation can promise an outcome', () => {
  it('phrases requirement sources as evidence, not predictions', () => {
    const facts = buildRecommendationFacts(makeGap(), JD_TEXT, RESUME_TEXT);
    const label = requirementSourceLabel(facts);

    expect(label).toBe('Job Description — Section "Requirements", Line 5');
    expect(label.toLowerCase()).not.toContain('guarantee');
    expect(label.toLowerCase()).not.toContain('pass');
  });

  it('keeps template prose free of outcome promises for every generated gap', () => {
    const gaps = buildSkillGaps({
      matches: [
        {
          skill: 'Kubernetes',
          canonical: 'Kubernetes',
          source: 'preferred',
          category: 'MISSING_PREF',
          credit: 0,
          cosine_similarity: null,
          evidence_found: false,
          evidence: [],
          weak: false,
          reason: 'not found',
          mentioned_without_evidence: false,
          implicit_evidence: null,
          matched_terms: ['kubernetes'],
        },
      ],
      jdText: JD_TEXT,
      resume: RESUME,
      resumeText: RESUME_TEXT,
    });

    expect(gaps.length).toBeGreaterThan(0);

    for (const gap of gaps) {
      const template = buildTemplateRecommendation(buildRecommendationFacts(gap, JD_TEXT, RESUME_TEXT));
      const combined = `${template.detection_result} ${template.recommended_action}`.toLowerCase();

      expect(combined).not.toContain('guarantee');
      expect(combined).not.toContain('will get you');
      expect(combined).not.toContain('pass probability');
      expect(combined).not.toContain('be hired');
    }
  });
});
