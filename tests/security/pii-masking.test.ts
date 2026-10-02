import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { generateObject } from 'ai';

vi.mock('@/lib/services/audit', () => ({
  recordAnalyticsEvent: vi.fn(async () => undefined),
  recordTimedEvent: vi.fn(async () => undefined),
  logAdminAction: vi.fn(async () => undefined),
}));

/**
 * Privacy mode is opt-in per analysis, and this suite proves it is enforced where
 * it matters: the text handed to the LLM provider, and the persisted safety record.
 *
 * The generator is injected, so no network call is made -- what we inspect is the
 * exact prompt string the provider would receive.
 */

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-0123456789';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-0123456789';
  process.env.OPENAI_API_KEY = 'sk-test-key-0123456789';

  const { resetEnvCache } = await import('@/lib/env');
  resetEnvCache();
});

const RESUME_TEXT = [
  'Dana Example',
  'dana@example.com | (415) 555-0100 | 123 Main Street, Austin, TX',
  'https://www.linkedin.com/in/danaexample',
  '',
  'Summary',
  'Backend engineer with six years building payment platforms in TypeScript and PostgreSQL.',
  '',
  'Experience',
  'Northwind Payments — Senior Backend Engineer',
  'Modelled the double-entry ledger schema in PostgreSQL with sixteen tables.',
  'Reduced p95 API latency from four hundred and eighty milliseconds to one hundred and ninety.',
].join('\n');

const JD_TEXT = [
  'Senior Backend Engineer at Acme Corp',
  'Questions? Call our recruiter at (212) 867-5309 or write to hiring@acme.example.',
  'Requirements: TypeScript, PostgreSQL, Docker and four years of experience.',
].join('\n');

function captureGenerate(): { prompts: string[]; generate: typeof generateObject } {
  const prompts: string[] = [];

  const generate = (async (args: { prompt: string }) => {
    prompts.push(args.prompt);
    return {
      object: {},
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  }) as unknown as typeof generateObject;

  return { prompts, generate };
}

describe('resume extraction with privacy mode enabled', () => {
  it('strips contact PII from the prompt while keeping the rest of the document', async () => {
    const { prompts, generate } = captureGenerate();
    const { extractResumeFromText } = await import('@/lib/ai/extract');
    const { makeResume } = await import('../helpers/factories');

    const result = await extractResumeFromText(RESUME_TEXT, {
      maskPii: true,
      skipCache: true,
      generate: (async (args: { prompt: string }) => {
        prompts.push(args.prompt);
        return { object: makeResume(), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      }) as unknown as typeof generateObject,
    });

    const prompt = prompts[0] ?? '';
    expect(prompt).not.toContain('(415) 555-0100');
    expect(prompt).not.toContain('123 Main Street');
    expect(prompt).not.toContain('linkedin.com/in/danaexample');
    expect(prompt).toContain('[REDACTED');
    expect(prompt).toContain('Backend engineer with six years');

    // The safety record names the categories only -- never the removed values.
    expect(result.safety.notice.matches).toContain('pii_masked:phone');
    expect(result.safety.notice.matches).toContain('pii_masked:street_address');
    expect(result.safety.notice.matches).toContain('pii_masked:social_url');
    expect(result.safety.notice.flagged).toBe(true);
    expect(JSON.stringify(result.safety)).not.toContain('555-0100');
    void generate;
  });

  it('keeps emails readable by default so the extractor can still populate contact details', async () => {
    const prompts: string[] = [];
    const { extractResumeFromText } = await import('@/lib/ai/extract');
    const { makeResume } = await import('../helpers/factories');

    await extractResumeFromText(RESUME_TEXT, {
      maskPii: true,
      skipCache: true,
      generate: (async (args: { prompt: string }) => {
        prompts.push(args.prompt);
        return { object: makeResume(), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      }) as unknown as typeof generateObject,
    });

    expect(prompts[0]).toContain('dana@example.com');
  });

  it('leaves the document untouched when privacy mode is off', async () => {
    const prompts: string[] = [];
    const { extractResumeFromText } = await import('@/lib/ai/extract');
    const { makeResume } = await import('../helpers/factories');

    const result = await extractResumeFromText(RESUME_TEXT, {
      skipCache: true,
      generate: (async (args: { prompt: string }) => {
        prompts.push(args.prompt);
        return { object: makeResume(), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
      }) as unknown as typeof generateObject,
    });

    expect(prompts[0]).toContain('(415) 555-0100');
    expect(result.safety.notice.matches.some((match) => match.startsWith('pii_masked:'))).toBe(false);
  });
});

describe('job description extraction with privacy mode enabled', () => {
  it('redacts recruiter contact details before the posting is sent to the provider', async () => {
    const prompts: string[] = [];
    const { extractJobDescriptionFromText } = await import('@/lib/ai/extract');
    const { makeJobDescription } = await import('../helpers/factories');

    const result = await extractJobDescriptionFromText(JD_TEXT, {
      maskPii: true,
      skipCache: true,
      generate: (async (args: { prompt: string }) => {
        prompts.push(args.prompt);
        return {
          object: makeJobDescription(),
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        };
      }) as unknown as typeof generateObject,
    });

    const prompt = prompts[0] ?? '';
    expect(prompt).not.toContain('(212) 867-5309');
    expect(prompt).toContain('[REDACTED]');
    expect(prompt).toContain('Requirements: TypeScript');
    expect(result.safety.notice.matches).toContain('pii_masked:phone');
    expect(result.safety.notice.flagged).toBe(true);
  });

  it('never serves a cached masked result to an unmasked request', async () => {
    const prompts: string[] = [];
    const { extractJobDescriptionFromText } = await import('@/lib/ai/extract');
    const { makeJobDescription } = await import('../helpers/factories');

    const generate = (async (args: { prompt: string }) => {
      prompts.push(args.prompt);
      return { object: makeJobDescription(), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    }) as unknown as typeof generateObject;

    await extractJobDescriptionFromText(JD_TEXT, { maskPii: true, skipCache: true, generate });
    const unmasked = await extractJobDescriptionFromText(JD_TEXT, { maskPii: false, generate });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('(212) 867-5309');
    expect(unmasked.safety.notice.flagged).toBe(false);
  });
});

describe('pipeline forwards the privacy decision', () => {
  it('passes maskPii through to the extraction stage', async () => {
    const { runAnalysisPipeline, buildResumeCorpus } = await import('@/lib/services/analysis-pipeline');
    const { fakeEmbed, makeResume, makeJobDescription, makeComplexity } = await import('../helpers/factories');

    const seen: Array<boolean | undefined> = [];

    const fakeSupabase = {
      from: () => ({
        insert: () => ({
          select: () => ({ single: async () => ({ data: { id: 'row-1' }, error: null }) }),
        }),
      }),
    };

    const resume = makeResume();

    await runAnalysisPipeline({
      userId: 'user-1',
      supabase: fakeSupabase as never,
      resumeVersion: {
        id: 'version-1',
        resume_id: 'resume-1',
        version_number: 1,
        extracted_data: resume,
        raw_text_length: buildResumeCorpus(resume).length,
        extraction_method: 'pdf',
        ats_metrics: { version: 1, complexity: makeComplexity(), method: 'pdf' },
      },
      jdText: JD_TEXT,
      title: 'Senior Backend Engineer',
      maskPii: true,
      persist: false,
      deps: {
        extractJobDescription: async (_text, options) => {
          seen.push(options?.maskPii);
          return {
            jobDescription: makeJobDescription(),
            safety: {
              notice: { flagged: true, matches: ['pii_masked:phone'], documents: ['job_description'] },
              sanitized_length: JD_TEXT.length,
              truncated: false,
              removed_control_chars: 0,
              removed_zero_width_chars: 0,
            },
            stats: null,
            cached: false,
          };
        },
        classify: (input: Parameters<typeof import('@/lib/services/matcher').classifySkillMatches>[0]) =>
          import('@/lib/services/matcher').then((module) =>
            module.classifySkillMatches({ ...input, embed: fakeEmbed }),
          ),
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
    });

    expect(seen).toEqual([true]);
  });
});
