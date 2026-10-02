import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/audit', () => ({
  recordAnalyticsEvent: vi.fn(async () => undefined),
  recordTimedEvent: vi.fn(async () => undefined),
  logAdminAction: vi.fn(async () => undefined),
}));

import { buildResumeCorpus, runAnalysisPipeline } from '@/lib/services/analysis-pipeline';
import { classifySkillMatches, containsTerm } from '@/lib/services/matcher';
import { fakeEmbed, makeComplexity, makeJobDescription, makeResume } from '../helpers/factories';

/**
 * Document text is untrusted input. Nothing in the scoring path may treat it as a
 * query, a template, or an instruction -- it is only ever a string to analyse and a
 * value to persist through a parameterised client.
 */

const RESUME = makeResume();

const SQL_SHAPED_LINES = [
  "Robert'); DROP TABLE analyses;--",
  "1' OR '1'='1",
  "'; UPDATE profiles SET status='active' WHERE 1=1;--",
  '") UNION SELECT email, password_hash FROM profiles --',
];

const CLEAN_JD =
  'Senior Backend Engineer at Acme Corp. Requirements: TypeScript, PostgreSQL, Docker. Preferred: Kubernetes, Terraform. Four years of experience designing payment APIs and owning a PostgreSQL ledger.';

const HOSTILE_JD = `${CLEAN_JD}\n${SQL_SHAPED_LINES.join('\n')}`;

interface Recorded {
  table: string;
  rows: unknown;
}

function createRecordingSupabase(): { client: unknown; recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  let counter = 0;

  const client = {
    from(table: string) {
      return {
        insert(rows: unknown) {
          recorded.push({ table, rows });
          return {
            select: () => ({
              single: async () => ({ data: { id: `${table}-${(counter += 1)}` }, error: null }),
            }),
          };
        },
      };
    },
  };

  return { client, recorded };
}

function makePipelineInput(jdText: string, supabase: unknown) {
  return {
    userId: 'user-1',
    supabase: supabase as never,
    resumeVersion: {
      id: 'version-1',
      resume_id: 'resume-1',
      version_number: 1,
      extracted_data: RESUME,
      raw_text_length: buildResumeCorpus(RESUME).length,
      extraction_method: 'pdf',
      ats_metrics: { version: 1, complexity: makeComplexity(), method: 'pdf' },
    },
    jdText,
    title: 'Senior Backend Engineer',
    companyName: 'Acme Corp',
    weightProfile: 'software_engineer' as const,
    persist: true as const,
    deps: {
      extractJobDescription: async () => ({
        jobDescription: makeJobDescription(),
        safety: {
          notice: { flagged: false, matches: [], documents: [] },
          sanitized_length: CLEAN_JD.length,
          truncated: false,
          removed_control_chars: 0,
          removed_zero_width_chars: 0,
        },
        stats: null,
        cached: false,
      }),
      classify: (input: Parameters<typeof classifySkillMatches>[0]) =>
        classifySkillMatches({ ...input, embed: fakeEmbed }),
      recommend: (async (input: { gaps: unknown[] }) => ({
        recommendations: input.gaps.map((_gap, index) => ({
          id: `template-${index}`,
          skill: 'Template',
          canonical: 'template',
          priority: 'low' as const,
          source: 'required' as const,
          category: 'MISSING_REQ' as const,
          requirement_source: 'Job Description — Requirements',
          requirement_excerpt: 'x',
          detection_result: 'y',
          related_assets: [],
          recommended_action: 'z',
          generated_by: 'template' as const,
          fallback_reason: null,
        })),
        llmStats: [],
      })) as never,
    },
  };
}

describe('SQL-shaped job description text', () => {
  it('is analysed as ordinary text and never changes the score', async () => {
    const clean = await runAnalysisPipeline(makePipelineInput(CLEAN_JD, createRecordingSupabase().client));
    const hostile = await runAnalysisPipeline(makePipelineInput(HOSTILE_JD, createRecordingSupabase().client));

    expect(hostile.result.scores.overall_score).toBe(clean.result.scores.overall_score);
    expect(hostile.result.scores.job_match_score).toBe(clean.result.scores.job_match_score);
    expect(hostile.result.skills.required_coverage).toBe(clean.result.skills.required_coverage);
  });

  it('is persisted verbatim as a value, never interpreted', async () => {
    const { client, recorded } = createRecordingSupabase();

    await runAnalysisPipeline(makePipelineInput(HOSTILE_JD, client));

    const jdRow = recorded.find((entry) => entry.table === 'job_descriptions');
    expect(jdRow).toBeDefined();

    const rows = jdRow?.rows as { raw_text: string };
    expect(rows.raw_text).toBe(HOSTILE_JD);
    // Whole statements arrived as one opaque payload string.
    expect(rows.raw_text).toContain("Robert'); DROP TABLE analyses;--");
    expect(rows.raw_text).toContain('UNION SELECT email, password_hash FROM profiles');
  });

  it('does not let injected SQL-shaped terms create skill matches', async () => {
    const hostile = await runAnalysisPipeline(makePipelineInput(HOSTILE_JD, createRecordingSupabase().client));

    const matchedSkills = [
      ...hostile.result.skills.required,
      ...hostile.result.skills.preferred,
      ...hostile.result.skills.other,
    ].map((match) => match.canonical.toLowerCase());

    expect(matchedSkills).not.toContain('drop table');
    expect(matchedSkills).not.toContain('union');
    expect(matchedSkills).not.toContain('profiles');
  });

  it('keeps evidence matching literal so a payload cannot spoof a substring', () => {
    expect(containsTerm('DROP TABLE analyses', 'drop table')).toBe(true);
    expect(containsTerm('modelled the ledger schema', 'DROP TABLE')).toBe(false);
    expect(containsTerm("Robert'); DROP TABLE analyses;--", 'analyses')).toBe(true);
  });
});
