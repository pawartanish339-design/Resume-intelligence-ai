import { describe, expect, it } from 'vitest';

import {
  SKILL_ALIAS_COUNT,
  SKILL_DICTIONARY,
  SKILL_DICTIONARY_SIZE,
  areRelatedSkills,
  canonicalizeSkill,
  getSkillCategory,
  lookupSkill,
  normalizeSkill,
  searchTermsForSkill,
  skillParents,
} from '@/lib/data/skill-dictionary';

describe('skill dictionary', () => {
  it('loads a non-trivial curated dictionary with unique canonical names', () => {
    expect(SKILL_DICTIONARY_SIZE).toBeGreaterThan(100);
    expect(SKILL_ALIAS_COUNT).toBeGreaterThan(150);

    const canonicals = SKILL_DICTIONARY.map((entry) => entry.canonical);
    expect(new Set(canonicals).size).toBe(canonicals.length);
  });

  it('normalises punctuation, casing, and version noise', () => {
    expect(normalizeSkill('  TypeScript  ')).toBe('typescript');
    expect(normalizeSkill('React.js')).toBe('react');
    expect(normalizeSkill('Node.JS')).toBe('node');
    expect(normalizeSkill('C++')).toBe('cpp');
    expect(normalizeSkill('C#')).toBe('csharp');
    expect(normalizeSkill('.NET Core')).toBe('dotnet core');
    expect(canonicalizeSkill('.NET Core')).toBe('.NET');
    expect(normalizeSkill('TypeScript 5.2')).toBe('typescript');
    // Punctuation splits into two tokens; the alias lookup is what unifies them.
    expect(normalizeSkill('PostgreSQL / Postgres')).toBe('postgresql postgres');
    expect(canonicalizeSkill('PostgreSQL')).toBe('PostgreSQL');
    expect(canonicalizeSkill('postgres')).toBe('PostgreSQL');
    expect(canonicalizeSkill('psql')).toBe('PostgreSQL');
    expect(normalizeSkill('')).toBe('');
    expect(normalizeSkill(null)).toBe('');
  });

  it('resolves aliases to a single canonical skill', () => {
    expect(canonicalizeSkill('React.js')).toBe(canonicalizeSkill('ReactJS'));
    expect(canonicalizeSkill('k8s')).toBe(canonicalizeSkill('Kubernetes'));
    expect(canonicalizeSkill('Postgres')).toBe(canonicalizeSkill('PostgreSQL'));
    expect(canonicalizeSkill('golang')).toBe(canonicalizeSkill('Go'));
  });

  it('keeps unmapped skills verbatim instead of guessing a canonical form', () => {
    // Falling back to the input (trimmed) keeps evidence search honest: an unknown
    // skill is never silently mapped onto a dictionary entry it might resemble.
    expect(canonicalizeSkill('  Some Proprietary Internal Tool ')).toBe('Some Proprietary Internal Tool');
    expect(lookupSkill('Some Proprietary Internal Tool')).toBeNull();
    expect(searchTermsForSkill('Some Proprietary Internal Tool')).toEqual(['Some Proprietary Internal Tool']);
  });

  it('knows parent/child relationships but does not treat every peer tool as related', () => {
    expect(skillParents('React.js')).toContain('JavaScript');

    expect(areRelatedSkills('React', 'React.js')).toBe(true);
    expect(areRelatedSkills('React', 'JavaScript')).toBe(true);
    expect(areRelatedSkills('Next.js', 'React')).toBe(true);

    // Two unrelated tools in the same category must not be "related": that would
    // hand out credit the candidate never earned.
    expect(areRelatedSkills('React', 'Angular')).toBe(false);
    expect(areRelatedSkills('React', 'PostgreSQL')).toBe(false);
    expect(areRelatedSkills('', 'React')).toBe(false);
  });

  it('produces search terms that always include the canonical form', () => {
    const terms = searchTermsForSkill('React.js').map((term) => term.toLowerCase());
    expect(terms).toContain('react');
    expect(terms).toContain('reactjs');
    expect(terms.length).toBeGreaterThan(1);
  });

  it('assigns every entry a category and exposes entries by category', () => {
    for (const entry of SKILL_DICTIONARY) {
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.aliases).toBeInstanceOf(Array);
    }

    expect(getSkillCategory('Python')).toBe('software');
    expect(getSkillCategory('Snowflake')).toBe('data');
    expect(getSkillCategory('SIEM')).toBe('cybersecurity');
    expect(getSkillCategory('Not A Skill')).toBeNull();
  });
});
