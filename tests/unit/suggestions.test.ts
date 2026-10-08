import { describe, expect, it } from 'vitest';

import {
  generateResumeSuggestions,
  categorizeSuggestions,
  filterSuggestionsByPriority,
  calculateSuggestionImpact,
  suggestionsFromBreakdown,
} from '@/lib/services/suggestions';
import { makeResume, makeJobDescription } from '../helpers/factories';
import type { HardRequirementCheck, SkillGapItem } from '@/types/analysis';

describe('Resume Suggestions Service', () => {
  it('generates high priority suggestions for unverified hard requirements', () => {
    const hardRequirements: HardRequirementCheck[] = [
      {
        requirement: 'Secret Security Clearance',
        method: 'pattern',
        verified: false,
        detail: 'Clearance not found in document',
        matched_text: null,
      },
    ];

    const suggestions = generateResumeSuggestions({
      resume: makeResume(),
      jobDescription: makeJobDescription(),
      hardRequirements,
    });

    const clearanceSuggestion = suggestions.find((s) => s.target === 'Secret Security Clearance');
    expect(clearanceSuggestion).toBeDefined();
    expect(clearanceSuggestion?.priority).toBe('high');
    expect(clearanceSuggestion?.category).toBe('Mandatory Requirements');
    expect(clearanceSuggestion?.action_items.length).toBeGreaterThan(0);
  });

  it('generates skill gap suggestions for missing required skills', () => {
    const gaps: SkillGapItem[] = [
      {
        skill: 'Kubernetes',
        canonical: 'kubernetes',
        category: 'MISSING_REQ',
        source: 'required',
        priority: 'high',
        jd_excerpt: 'Must have 3+ years Kubernetes experience',
        jd_line: 12,
        jd_section: 'Requirements',
        related_assets: ['Docker', 'Containers'],
        implicit_evidence: null,
        detection_result: 'Missing required skill',
      },
    ];

    const suggestions = generateResumeSuggestions({
      resume: makeResume(),
      jobDescription: makeJobDescription(),
      gaps,
    });

    const k8s = suggestions.find((s) => s.target === 'Kubernetes');
    expect(k8s).toBeDefined();
    expect(k8s?.priority).toBe('high');
    expect(k8s?.category).toBe('Core Skills');
    expect(k8s?.before_example).toContain('Docker');
  });

  it('generates quantification suggestions when bullet points lack measurable metrics', () => {
    const resume = makeResume({
      experience: [
        {
          title: 'Software Engineer',
          company: 'Acme Corp',
          location: 'Remote',
          start_date: '2021-01',
          end_date: '2023-01',
          is_current: false,
          bullet_points: ['Built web interfaces and fixed bugs across components.'],
          technologies_used: ['React', 'TypeScript'],
        },
      ],
    });

    const suggestions = generateResumeSuggestions({
      resume,
      jobDescription: makeJobDescription(),
      quality: {
        score: 60,
        action_verb_density: 0.9,
        quantified_bullet_ratio: 0.1,
        achievements_index: 20,
        structure_score: 80,
        readability_score: 75,
        bullet_length_fit: 80,
        bullet_count: 1,
        passive_openers: [],
        findings: ['Few quantified bullets'],
        flesch_reading_ease: 65,
        flesch_kincaid_grade: 9,
        date_format_uniform: true,
        reverse_chronological: true,
        date_findings: [],
      },
    });

    const quant = suggestions.find((s) => s.type === 'quantification');
    expect(quant).toBeDefined();
    expect(quant?.priority).toBe('high');
    expect(quant?.before_example).toContain('Built web interfaces');
    expect(quant?.after_example).toBeDefined();
  });

  it('identifies passive openers and suggests power action verbs', () => {
    const resume = makeResume({
      experience: [
        {
          title: 'Developer',
          company: 'Tech LLC',
          location: null,
          start_date: '2020-01',
          end_date: '2022-01',
          is_current: false,
          bullet_points: ['Responsible for deploying server components and maintaining database.'],
          technologies_used: [],
        },
      ],
    });

    const suggestions = generateResumeSuggestions({
      resume,
      jobDescription: makeJobDescription(),
    });

    const verbSuggestion = suggestions.find((s) => s.type === 'action_verb');
    expect(verbSuggestion).toBeDefined();
    expect(verbSuggestion?.before_example).toContain('Responsible for');
  });

  it('categorizes and filters suggestions properly', () => {
    const suggestions = generateResumeSuggestions({
      resume: makeResume(),
      jobDescription: makeJobDescription(),
      gaps: [
        {
          skill: 'Go',
          canonical: 'go',
          category: 'MISSING_REQ',
          source: 'required',
          priority: 'high',
          jd_excerpt: 'Go proficiency',
          jd_line: 1,
          jd_section: 'Tech',
          related_assets: [],
          implicit_evidence: null,
          detection_result: 'missing',
        },
        {
          skill: 'Redis',
          canonical: 'redis',
          category: 'MISSING_PREF',
          source: 'preferred',
          priority: 'medium',
          jd_excerpt: 'Nice to have Redis',
          jd_line: 2,
          jd_section: 'Tech',
          related_assets: [],
          implicit_evidence: null,
          detection_result: 'missing',
        },
      ],
    });

    const categories = categorizeSuggestions(suggestions);
    expect(Object.keys(categories).length).toBeGreaterThan(0);

    const highPriority = filterSuggestionsByPriority(suggestions, 'high');
    expect(highPriority.every((s) => s.priority === 'high')).toBe(true);

    const impact = calculateSuggestionImpact(suggestions);
    expect(impact.total).toBe(suggestions.length);
    expect(impact.estimatedScoreBoost).toBeGreaterThan(0);
  });

  it('handles empty or missing inputs gracefully', () => {
    const empty = generateResumeSuggestions({});
    expect(Array.isArray(empty)).toBe(true);
    expect(empty.length).toBe(0);

    expect(suggestionsFromBreakdown(null)).toEqual([]);
    expect(suggestionsFromBreakdown({})).toEqual([]);
    expect(suggestionsFromBreakdown('invalid')).toEqual([]);
  });
});
