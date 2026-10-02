import { describe, expect, it } from 'vitest';

import { analyzeAts, characterExtractionDensity, detectSectionHeaders } from '@/lib/services/ats';
import { analyzeQuality, actionVerbDensity, achievementsIndex, collectBullets, isQuantifiedBullet } from '@/lib/services/quality';
import { analyzeExperience, isEntryLevelJd, yearsScoreFor } from '@/lib/services/experience';
import { buildResumeCorpus } from '@/lib/services/analysis-pipeline';
import { makeComplexity, makeJobDescription, makeResume } from '../helpers/factories';

describe('ATS compatibility analysis', () => {
  const resume = makeResume();
  const text = buildResumeCorpus(resume);

  it('scores a clean single-column document highly and explains every check', () => {
    const analysis = analyzeAts({ text, complexity: makeComplexity() });

    expect(analysis.score).toBeGreaterThan(60);
    expect(analysis.score).toBeLessThanOrEqual(100);
    expect(analysis.checks.length).toBeGreaterThanOrEqual(5);
    expect(analysis.checks.map((check) => check.name)).toContain('Standard section headings');
    expect(analysis.checks.map((check) => check.name)).toContain('Machine-readable contact details');
    expect(analysis.checks.every((check) => check.detail.length > 5)).toBe(true);
    expect(analysis.checks.every((check) => check.weight > 0)).toBe(true);
  });

  it('penalises multi-column layouts, which are the most common real parsing failure', () => {
    const single = analyzeAts({ text, complexity: makeComplexity({ columns_detected: 0 }) });
    const multi = analyzeAts({ text, complexity: makeComplexity({ columns_detected: 2 }) });

    expect(multi.score).toBeLessThan(single.score);

    const columnCheck = multi.checks.find((check) => /column/i.test(`${check.name} ${check.detail}`));
    expect(columnCheck).toBeDefined();
    expect(columnCheck?.passed).toBe(false);
    expect(columnCheck?.detail).toMatch(/column/i);
  });

  it('flags tables, text boxes, images, symbol fonts, and missing core sections', () => {
    const crowded = analyzeAts({
      text: 'Just a paragraph without any recognised headings. Email: a@b.com',
      complexity: makeComplexity({
        tables_detected: 3,
        table_rows_detected: 12,
        text_boxes_detected: 2,
        images_detected: 1,
        symbol_fonts: ['Wingdings'],
        non_embedded_fonts: ['Calibri Light'],
      }),
    });

    const failing = crowded.checks.filter((check) => !check.passed).map((check) => check.name);
    expect(failing.length).toBeGreaterThan(0);
    expect(crowded.findings.length).toBeGreaterThan(0);
    expect(crowded.score).toBeLessThan(60);
  });

  it('detects conventional section headings and reports which core sections are missing', () => {
    const withHeadings = detectSectionHeaders(
      'SUMMARY\nBackend engineer.\nEXPERIENCE\nSoftware Engineer\nSKILLS\nTypeScript\nEDUCATION\nBSc Computer Science',
    );
    expect(withHeadings.found).toEqual(expect.arrayContaining(['Summary', 'Experience', 'Skills', 'Education']));
    expect(withHeadings.missingCore).toEqual([]);

    const withoutHeadings = detectSectionHeaders('just a wall of text with no section headings at all');
    expect(withoutHeadings.missingCore.length).toBeGreaterThan(0);

    // The reconstructed corpus keeps the headings so the checks stay meaningful.
    expect(detectSectionHeaders(text).found.length).toBeGreaterThan(2);
  });

  it('measures character extraction density without dividing by zero', () => {
    expect(characterExtractionDensity(text)).toBeGreaterThan(0);
    expect(characterExtractionDensity('')).toBe(0);
  });
});

describe('content quality analysis', () => {
  it('counts strong openers and measurable outcomes', () => {
    expect(isQuantifiedBullet('Reduced p95 API latency from 480 ms to 190 ms.')).toBe(true);
    expect(isQuantifiedBullet('Improved the onboarding flow.')).toBe(false);
    expect(isQuantifiedBullet('Cut costs by 30% and doubled throughput.')).toBe(true);

    const density = actionVerbDensity([
      'Built the billing dashboard',
      'Led the migration to PostgreSQL',
      'Was responsible for the roadmap',
    ]);
    expect(density).toBeCloseTo(2 / 3, 2);

    expect(actionVerbDensity(['Was responsible for the roadmap'])).toBe(0);
    expect(actionVerbDensity([])).toBe(0);
  });

  it('rewards quantified achievements without letting one bullet dominate', () => {
    const index = achievementsIndex([
      'Reduced p95 latency by 42% for 1.2 million daily requests',
      'Cut cloud spend by $48k per year after removing idle nodes',
    ]);
    expect(index).toBeGreaterThan(70);
    expect(achievementsIndex([])).toBe(0);
  });

  it('collects bullets from experience, projects, and achievements', () => {
    const bullets = collectBullets(makeResume());
    expect(bullets.length).toBeGreaterThan(8);
    expect(bullets.some((bullet) => bullet.includes('ledger'))).toBe(true);
  });

  it('produces a full report with findings a human can act on', () => {
    const report = analyzeQuality(makeResume());

    expect(report.bullet_count).toBeGreaterThan(5);
    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.quantified_bullet_ratio).toBeGreaterThan(0.3);
    expect(Number.isFinite(report.flesch_reading_ease)).toBe(true);
    expect(Array.isArray(report.date_findings)).toBe(true);
  });

  it('is deterministic for identical input', () => {
    const first = analyzeQuality(makeResume());
    const second = analyzeQuality(makeResume());
    expect(first).toEqual(second);
  });
});

describe('experience relevance', () => {
  it('scores years against the stated minimum and stays neutral when none is stated', () => {
    expect(yearsScoreFor(72, 4)).toBe(100);
    expect(yearsScoreFor(24, 4)).toBeLessThan(90);
    expect(yearsScoreFor(24, 4)).toBeGreaterThanOrEqual(30);

    // No stated minimum + documented tenure -> neutral, not a penalty.
    expect(yearsScoreFor(48, null)).toBe(70);
    // No stated minimum and no measured tenure -> below neutral, never zero.
    expect(yearsScoreFor(0, null)).toBe(50);
    // A stated minimum with no measured tenure floors at 30 rather than scoring zero.
    expect(yearsScoreFor(0, 4)).toBe(30);
  });

  it('detects entry-level postings from seniority and required years', () => {
    expect(isEntryLevelJd(makeJobDescription())).toBe(false);
    expect(
      isEntryLevelJd({
        requirements: { ...makeJobDescription().requirements, min_years_experience: 0 },
        meta: { ...makeJobDescription().meta, seniority_level: 'Internship' },
      }),
    ).toBe(true);
  });

  it('treats projects as experience for entry-level roles and explains its reasoning', () => {
    const resume = makeResume();
    const entryLevel = makeJobDescription({
      meta: { job_title: 'Junior Backend Engineer', company_name: null, industry: null, seniority_level: 'Junior' },
      requirements: { ...makeJobDescription().requirements, min_years_experience: 1, hard_requirements: [] },
    });

    const report = analyzeExperience({
      resume,
      jobDescription: entryLevel,
      responsibilitySimilarities: [0.8, 0.7],
      projectSimilarities: [0.9],
    });

    expect(report.entry_level_mode).toBe(true);
    expect(report.total_months).toBeGreaterThan(0);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.score).toBeGreaterThan(0);
  });

  it('falls back to neutral values when the resume has no dated experience', () => {
    const report = analyzeExperience({
      resume: makeResume({ experience: [], projects: [] }),
      jobDescription: makeJobDescription(),
      responsibilitySimilarities: [],
    });

    expect(report.total_months).toBe(0);
    expect(report.years_score).toBe(30);
    expect(report.relevance_score).toBe(70);
    expect(report.findings.join(' ')).toMatch(/no dated experience/i);
  });
});
