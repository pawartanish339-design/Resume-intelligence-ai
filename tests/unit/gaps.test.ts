import { describe, expect, it } from 'vitest';

import {
  buildSkillGaps,
  detectionResultFor,
  GAP_CATEGORIES,
  isGap,
  priorityFor,
  relatedAssetsFor,
} from '@/lib/services/gaps';
import { findJdExcerpt } from '@/lib/ai/safety';
import type { MatchCategory, RequirementSource, SkillMatch } from '@/types/analysis';
import { makeResume } from '@/tests/helpers/factories';

const JD_TEXT = [
  'About the role',
  'We are hiring a Senior Backend Engineer to own the payments ledger.',
  '',
  'Requirements',
  'TypeScript experience is required for this role.',
  'Kubernetes is a nice to have.',
  'Security clearance is required.',
].join('\n');

function makeMatch(overrides: Partial<SkillMatch> = {}): SkillMatch {
  const base: SkillMatch = {
    skill: 'TypeScript',
    canonical: 'TypeScript',
    source: 'required',
    category: 'MISSING_REQ',
    credit: 0,
    cosine_similarity: null,
    evidence_found: false,
    evidence: [],
    weak: false,
    reason: 'Not mentioned in the resume.',
    mentioned_without_evidence: false,
    implicit_evidence: null,
    matched_terms: ['typescript'],
  };

  return { ...base, ...overrides };
}

describe('gap classification', () => {
  it('treats the three gap categories and weak partials as gaps', () => {
    expect(GAP_CATEGORIES).toEqual(['MISSING_REQ', 'MISSING_PREF', 'MENTIONED_WITHOUT_EVIDENCE']);

    for (const category of GAP_CATEGORIES) {
      expect(isGap(makeMatch({ category }))).toBe(true);
    }

    expect(isGap(makeMatch({ category: 'PARTIAL', weak: true }))).toBe(true);
    expect(isGap(makeMatch({ category: 'PARTIAL', weak: false }))).toBe(false);
    expect(isGap(makeMatch({ category: 'EXACT' }))).toBe(false);
    expect(isGap(makeMatch({ category: 'STRONG_RELATED' }))).toBe(false);
  });

  it('orders priority by realism: unmet required items first', () => {
    expect(priorityFor(makeMatch({ category: 'MISSING_REQ', source: 'required' }))).toBe('high');
    expect(priorityFor(makeMatch({ category: 'PARTIAL', source: 'required' }))).toBe('high');
    expect(priorityFor(makeMatch({ category: 'MISSING_PREF', source: 'preferred' }))).toBe('medium');
    expect(
      priorityFor(makeMatch({ category: 'MENTIONED_WITHOUT_EVIDENCE', source: 'preferred' })),
    ).toBe('medium');
  });

  it('explains the detection result in user-facing terms without guarantees', () => {
    const missing = detectionResultFor(makeMatch({ category: 'MISSING_REQ' }));
    expect(missing).toContain('required item in the posting');

    const preferred = detectionFor('MISSING_PREF');
    expect(preferred).toContain('preferred');

    const mentioned = detectionFor('MENTIONED_WITHOUT_EVIDENCE');
    expect(mentioned).toContain('skills section');

    const weak = detectionResultFor(
      makeMatch({ category: 'PARTIAL', weak: true, cosine_similarity: 0.64 }),
    );
    expect(weak).toContain('0.64');

    const partial = detectionResultFor(makeMatch({ category: 'PARTIAL', weak: false }));
    expect(partial).toContain('no exact keyword match');

    for (const text of [missing, preferred, mentioned, weak, partial]) {
      expect(text.toLowerCase()).not.toContain('guarantee');
      expect(text.toLowerCase()).not.toContain('pass probability');
    }
  });
});

function detectionFor(category: MatchCategory): string {
  return detectionResultFor(makeMatch({ category, source: 'preferred' satisfies RequirementSource }));
}

describe('JD excerpts', () => {
  it('finds the verbatim line and nearest heading', () => {
    const excerpt = findJdExcerpt(JD_TEXT, ['TypeScript']);

    expect(excerpt).not.toBeNull();
    expect(excerpt?.excerpt).toBe('TypeScript experience is required for this role.');
    expect(excerpt?.line).toBe(5);
    expect(excerpt?.section).toBe('Requirements');
  });

  it('returns null instead of inventing an excerpt', () => {
    expect(findJdExcerpt(JD_TEXT, ['Rust'])).toBeNull();
    expect(findJdExcerpt('', ['TypeScript'])).toBeNull();
    // Terms shorter than three characters are ignored rather than matched loosely.
    expect(findJdExcerpt(JD_TEXT, ['TS'])).toBeNull();
  });
});

describe('related assets', () => {
  const resume = makeResume();
  const resumeText = [
    resume.summary,
    ...resume.experience.flatMap((role) => [role.title, role.company, ...role.bullet_points]),
    ...resume.projects.flatMap((project) => [project.title, project.description, ...project.bullet_points]),
    ...resume.skills.technical,
    ...resume.skills.frameworks_and_tools,
  ].join('\n');

  it('surfaces only assets that really exist in the resume', () => {
    const assets = relatedAssetsFor('Kubernetes', resume, resumeText);

    expect(assets).toContain('Docker');
    expect(assets.length).toBeLessThanOrEqual(5);
    for (const asset of assets) {
      expect(resumeText.toLowerCase()).toContain(asset.toLowerCase());
    }
  });

  it('never suggests the missing skill itself', () => {
    const assets = relatedAssetsFor('Terraform', resume, resumeText);
    expect(assets.map((asset) => asset.toLowerCase())).not.toContain('terraform');
  });
});

describe('buildSkillGaps', () => {
  it('keeps deterministic ordering and carries the JD source evidence', () => {
    const resume = makeResume();
    const resumeText = resume.summary ?? '';

    const gaps = buildSkillGaps({
      matches: [
        makeMatch({ skill: 'Kubernetes', canonical: 'Kubernetes', category: 'MISSING_PREF', source: 'preferred' }),
        makeMatch({ skill: 'TypeScript', canonical: 'TypeScript', category: 'MISSING_REQ', source: 'required' }),
        makeMatch({ skill: 'PostgreSQL', canonical: 'PostgreSQL', category: 'EXACT', credit: 1 }),
      ],
      jdText: JD_TEXT,
      resume,
      resumeText,
    });

    expect(gaps.map((gap) => gap.skill)).toEqual(['TypeScript', 'Kubernetes']);

    const [typescript, kubernetes] = gaps;
    expect(typescript?.jd_line).toBe(5);
    expect(typescript?.jd_section).toBe('Requirements');
    expect(typescript?.detection_result).toContain('required item');

    expect(kubernetes?.jd_line).toBe(6);
    expect(kubernetes?.priority).toBe('medium');
  });

  it('carries implicit evidence through to the gap item without raising credit', () => {
    const resume = makeResume();
    const implicit = { snippet: 'Modelled the double-entry ledger schema in PostgreSQL.', similarity: 0.74 };

    const gaps = buildSkillGaps({
      matches: [
        makeMatch({
          skill: 'Relational modelling',
          canonical: 'Relational modelling',
          category: 'MISSING_REQ',
          source: 'required',
          implicit_evidence: implicit,
        }),
      ],
      jdText: JD_TEXT,
      resume,
      resumeText: resume.summary ?? '',
    });

    expect(gaps[0]?.implicit_evidence).toEqual(implicit);
    expect(gaps[0]?.category).toBe('MISSING_REQ');
  });

  it('appends extra requirements (unmet hard requirements) as required gaps', () => {
    const resume = makeResume();

    const gaps = buildSkillGaps({
      matches: [],
      jdText: JD_TEXT,
      resume,
      resumeText: resume.summary ?? '',
      extra: [
        {
          skill: 'Security clearance',
          source: 'required',
          priority: 'high',
          detection: 'The posting requires a clearance that was not found in your document.',
        },
      ],
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      skill: 'Security clearance',
      category: 'MISSING_REQ',
      priority: 'high',
      jd_line: 7,
      jd_section: 'Requirements',
      implicit_evidence: null,
    });
  });

  it('is a pure function: identical input produces identical output', () => {
    const resume = makeResume();
    const matches = [
      makeMatch({ skill: 'Kubernetes', category: 'MISSING_PREF', source: 'preferred' }),
      makeMatch({ skill: 'TypeScript', category: 'MISSING_REQ' }),
    ];

    const first = buildSkillGaps({ matches, jdText: JD_TEXT, resume, resumeText: resume.summary ?? '' });
    const second = buildSkillGaps({ matches, jdText: JD_TEXT, resume, resumeText: resume.summary ?? '' });

    expect(second).toEqual(first);
  });
});
