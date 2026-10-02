import { describe, expect, it } from 'vitest';

import { classifySkillMatches, checkHardRequirement } from '@/lib/services/matcher';
import { buildResumeCorpus } from '@/lib/services/analysis-pipeline';
import { fakeEmbed, makeJobDescription, makeResume } from '../helpers/factories';
import type { MatchCategory, SkillMatch } from '@/types/analysis';

async function match(
  resumeOverrides: Parameters<typeof makeResume>[0] = {},
  jdOverrides: Parameters<typeof makeJobDescription>[0] = {},
) {
  const resume = makeResume(resumeOverrides);
  const jobDescription = makeJobDescription(jdOverrides);

  return classifySkillMatches({
    resume,
    jobDescription,
    resumeText: buildResumeCorpus(resume),
    embed: fakeEmbed,
  });
}

function pick(matches: SkillMatch[], skill: string): SkillMatch {
  const found = matches.find((match) => match.skill.toLowerCase() === skill.toLowerCase());
  if (!found) {
    throw new Error(`No match produced for "${skill}". Got: ${matches.map((entry) => entry.skill).join(', ')}`);
  }
  return found;
}

describe('classifySkillMatches', () => {
  it('credits a requirement found verbatim in the document at 100%', async () => {
    const result = await match();
    const typescript = pick(result.required, 'TypeScript');

    expect(typescript.category).toBe<MatchCategory>('EXACT');
    expect(typescript.credit).toBe(1);
    expect(typescript.evidence_found).toBe(true);
    expect(typescript.evidence.length).toBeGreaterThan(0);
    expect(result.requiredCoverage).toBe(100);
  });

  it('matches through normalisation and aliases, and pays less for a related tool', async () => {
    const result = await match({}, {
      requirements: {
        required_skills: ['React.js', 'K8s', 'Next.js'],
        preferred_skills: [],
        soft_skills: [],
        hard_requirements: [],
        education_level: [],
        min_years_experience: null,
      },
    });

    // "React.js" normalises to the same token as "React" -> exact keyword credit.
    const react = pick(result.required, 'React.js');
    expect(react.category).toBe<MatchCategory>('EXACT');
    expect(react.credit).toBe(1);

    // "K8s" is an alias of Kubernetes, which the document states in full.
    const kubernetes = pick(result.required, 'K8s');
    expect(kubernetes.category).toBe<MatchCategory>('EXACT');
    expect(kubernetes.canonical).toBe('Kubernetes');

    // "Next.js" is not present, but the document lists React (its parent concept):
    // related credit, not full credit, and never more than the engine can evidence.
    const next = pick(result.required, 'Next.js');
    expect(next.category).toBe<MatchCategory>('STRONG_RELATED');
    expect(next.credit).toBeCloseTo(0.85, 2);
    expect(next.reason).toMatch(/related skill/i);
  });

  it('reduces credit for a skill that is listed but never demonstrated', async () => {
    const result = await match(
      {
        experience: [
          {
            company: 'Quiet Corp',
            title: 'Analyst',
            location: null,
            start_date: '2020-01',
            end_date: '2021-01',
            is_current: false,
            bullet_points: ['Maintained weekly reports for the operations team.'],
            technologies_used: [],
          },
        ],
        projects: [],
        summary: 'Analyst focused on reporting.',
        skills: {
          technical: ['Snowflake'],
          frameworks_and_tools: [],
          soft_skills: [],
          languages: [],
        },
      },
      {
        requirements: {
          required_skills: ['Snowflake'],
          preferred_skills: [],
          soft_skills: [],
          hard_requirements: [],
          education_level: [],
          min_years_experience: null,
        },
        responsibilities: [],
        tools_and_technologies: [],
        domain_keywords: [],
      },
    );

    const snowflake = pick(result.required, 'Snowflake');
    expect(snowflake.category).toBe<MatchCategory>('MENTIONED_WITHOUT_EVIDENCE');
    expect(snowflake.credit).toBeLessThan(1);
    expect(snowflake.evidence_found).toBe(false);
    expect(snowflake.reason).toMatch(/reduced weight/i);
  });

  it('reports a missing required skill as a zero-credit gap instead of guessing', async () => {
    const result = await match({}, {
      requirements: {
        required_skills: ['COBOL', 'Fortran'],
        preferred_skills: [],
        soft_skills: [],
        hard_requirements: [],
        education_level: [],
        min_years_experience: null,
      },
      responsibilities: [],
      tools_and_technologies: [],
      domain_keywords: [],
    });

    for (const skill of ['COBOL', 'Fortran']) {
      const gap = pick(result.required, skill);
      expect(gap.category).toBe<MatchCategory>('MISSING_REQ');
      expect(gap.credit).toBe(0);
      expect(gap.evidence_found).toBe(false);
    }

    expect(result.requiredCoverage).toBe(0);
  });

  it('separates preferred gaps from required gaps', async () => {
    const result = await match();

    const terraform = pick(result.preferred, 'Terraform');
    expect(terraform.category).toBe<MatchCategory>('MISSING_PREF');

    const kubernetes = pick(result.preferred, 'Kubernetes');
    expect(kubernetes.credit).toBeGreaterThan(0);
    expect(result.preferredCoverage).toBeGreaterThan(0);
    expect(result.preferredCoverage).toBeLessThan(100);
  });

  it('never double-counts one concept that appears under several spellings', async () => {
    const result = await match({}, {
      requirements: {
        required_skills: ['PostgreSQL', 'postgres'],
        preferred_skills: ['postgres', 'Terraform'],
        soft_skills: [],
        hard_requirements: [],
        education_level: [],
        min_years_experience: null,
      },
    });

    // Required: one entry despite two spellings. Preferred: the alias duplicate is
    // dropped, so a single concept cannot be scored twice (or missed twice).
    expect(result.required.map((entry) => entry.skill)).toEqual(['PostgreSQL']);
    expect(result.preferred.map((entry) => entry.skill)).toEqual(['Terraform']);
  });

  it('lists skills that the posting never mentions as NOT_RELEVANT', async () => {
    const result = await match({}, {
      requirements: {
        required_skills: ['TypeScript'],
        preferred_skills: [],
        soft_skills: [],
        hard_requirements: [],
        education_level: [],
        min_years_experience: null,
      },
      responsibilities: [],
      tools_and_technologies: [],
      domain_keywords: [],
    });

    const irrelevant = result.other.filter((entry) => entry.category === 'NOT_RELEVANT');
    expect(irrelevant.length).toBeGreaterThan(0);
    expect(irrelevant.every((entry) => entry.credit === 0)).toBe(true);
    expect(irrelevant.map((entry) => entry.skill)).toContain('dbt');
  });

  it('produces an audit trail for every match decision', async () => {
    const result = await match();
    const all = [...result.required, ...result.preferred, ...result.other];

    expect(all.length).toBeGreaterThan(5);
    for (const match of all) {
      expect(match.reason.length).toBeGreaterThan(10);
      expect(match.matched_terms.length).toBeGreaterThan(0);
      expect(match.credit).toBeGreaterThanOrEqual(0);
      expect(match.credit).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic when the embedding provider is deterministic', async () => {
    const first = await match();
    const second = await match();

    const summarise = (result: Awaited<ReturnType<typeof classifySkillMatches>>) =>
      [...result.required, ...result.preferred, ...result.other]
        .map((entry) => `${entry.skill}:${entry.category}:${entry.credit}`)
        .sort();

    expect(summarise(first)).toEqual(summarise(second));
    expect(first.requiredCoverage).toBe(second.requiredCoverage);
    expect(first.semanticAlignment).toBe(second.semanticAlignment);
  });
});

describe('checkHardRequirement', () => {
  const resume = makeResume();
  const resumeText = buildResumeCorpus(resume);

  it('verifies a security clearance only when the document states one', () => {
    const absent = checkHardRequirement('Active security clearance required', resumeText, resume);
    expect(absent.verified).toBe(false);
    expect(absent.method).toBe('keyword');
    expect(absent.detail).toMatch(/cannot be inferred/i);

    const withClearance = checkHardRequirement(
      'Active security clearance required',
      `${resumeText}\nHolds an active secret clearance sponsored by the Department of Defense.`,
      resume,
    );
    expect(withClearance.verified).toBe(true);
    expect(withClearance.matched_text).toBeTruthy();
  });

  it('handles work-authorisation wording separately from clearance wording', () => {
    const check = checkHardRequirement('Must be a US citizen or green card holder', resumeText, resume);
    expect(check.method).toBe('keyword');
    expect(check.verified).toBe(false);
    expect(check.detail).toMatch(/employer/i);
  });

  it('compares explicit years of experience against documented tenure', () => {
    const short = checkHardRequirement('5+ years of backend experience', resumeText, resume, 36);
    expect(short.method).toBe('experience_months');
    expect(short.verified).toBe(false);
    expect(short.detail).toContain('3');

    const long = checkHardRequirement('5+ years of backend experience', resumeText, resume, 72);
    expect(long.verified).toBe(true);
  });

  it('never lets a semantic similarity satisfy a hard requirement', () => {
    // The check is keyword/tenure based by construction; this asserts the contract.
    const check = checkHardRequirement('Bachelor degree in Computer Science', resumeText, resume);
    expect(['keyword', 'education', 'experience_months']).toContain(check.method);
    expect(typeof check.verified).toBe('boolean');
  });
});
