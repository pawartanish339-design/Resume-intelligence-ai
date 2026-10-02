import type { CanonicalJD, CanonicalResume } from '@/lib/ai/schemas';
import type { LlmCallStats } from '@/types/analysis';
import type { DocumentComplexityMetrics } from '@/types/resume';

/**
 * Deterministic fixtures shared by the unit, integration, and security suites.
 *
 * The resume is deliberately written the way a real one reads: quantified bullets,
 * strong action verbs, and skills demonstrated in context (not only listed).
 */

export function makeResume(overrides: Partial<CanonicalResume> = {}): CanonicalResume {
  const base: CanonicalResume = {
    contact: {
      full_name: 'Dana Example',
      email: 'dana@example.com',
      phone: '+1 (415) 555-0100',
      location: 'Austin, TX',
      linkedin_url: 'https://www.linkedin.com/in/danaexample',
      github_url: 'https://github.com/danaexample',
      portfolio_url: null,
    },
    summary:
      'Backend engineer with 6 years building payment and data platforms in TypeScript, Python, and PostgreSQL.',
    education: [
      {
        institution: 'State University',
        degree: 'BSc',
        field_of_study: 'Computer Science',
        start_date: '2014',
        end_date: '2018',
        gpa: '3.7',
        honors: ['Dean"s List'],
      },
    ],
    experience: [
      {
        company: 'Northwind Payments',
        title: 'Senior Backend Engineer',
        location: 'Austin, TX',
        start_date: '2021-04',
        end_date: null,
        is_current: true,
        bullet_points: [
          'Rebuilt the billing dashboard in TypeScript and React, cutting page load time by 42%.',
          'Modelled the double-entry ledger schema in PostgreSQL with 16 tables and row-level security.',
          'Containerised twelve services with Docker and deployed them to managed Kubernetes clusters.',
          'Reduced p95 API latency from 480 ms to 190 ms by adding Redis caching and query indexes.',
        ],
        technologies_used: ['TypeScript', 'React', 'PostgreSQL', 'Docker', 'Kubernetes', 'Redis'],
      },
      {
        company: 'Bluebird Analytics',
        title: 'Software Engineer',
        location: 'Remote',
        start_date: '2018-07',
        end_date: '2021-03',
        is_current: false,
        bullet_points: [
          'Built an ingestion pipeline in Python processing 2.4 million events per day.',
          'Wrote integration tests that raised coverage of the billing service from 41% to 86%.',
          'Partnered with two analysts to define the metrics layer in dbt.',
        ],
        technologies_used: ['Python', 'Airflow', 'dbt', 'AWS'],
      },
    ],
    projects: [
      {
        title: 'Ledger Playground',
        description: 'Open-source double-entry accounting sandbox used by 400 developers.',
        bullet_points: [
          'Implemented idempotent transfers with PostgreSQL row locks and a 99.98% success rate.',
          'Published a CI pipeline that runs 120 integration tests per pull request.',
        ],
        technologies_used: ['TypeScript', 'PostgreSQL', 'Vitest'],
        link: 'https://github.com/danaexample/ledger-playground',
      },
    ],
    skills: {
      technical: ['TypeScript', 'Python', 'PostgreSQL', 'Redis', 'SQL'],
      frameworks_and_tools: ['Docker', 'Kubernetes', 'Airflow', 'dbt', 'AWS', 'Vitest'],
      soft_skills: ['Cross-functional collaboration', 'Technical writing'],
      languages: ['English', 'Spanish'],
    },
    certifications: [
      { name: 'AWS Certified Developer - Associate', issuer: 'Amazon Web Services', date_obtained: '2023-05' },
    ],
    achievements: ['Speaker at PyCon Austin 2022 on idempotent payment processing'],
  };

  return { ...base, ...overrides };
}

export function makeJobDescription(overrides: Partial<CanonicalJD> = {}): CanonicalJD {
  const base: CanonicalJD = {
    meta: {
      job_title: 'Senior Backend Engineer',
      company_name: 'Acme Corp',
      industry: 'Fintech',
      seniority_level: 'Senior',
    },
    requirements: {
      required_skills: ['TypeScript', 'PostgreSQL', 'Docker'],
      preferred_skills: ['Kubernetes', 'Terraform'],
      soft_skills: ['Cross-functional collaboration'],
      hard_requirements: [],
      education_level: [],
      min_years_experience: 4,
    },
    responsibilities: [
      'Design and operate payment APIs used by millions of requests per day.',
      'Own the reliability of a PostgreSQL-backed ledger and its migrations.',
      'Partner with product managers to scope deliverables and reduce delivery risk.',
    ],
    tools_and_technologies: ['GitHub Actions', 'Datadog'],
    domain_keywords: ['payments', 'ledger', 'PCI'],
  };

  return { ...base, ...overrides };
}

export function makeComplexity(overrides: Partial<DocumentComplexityMetrics> = {}): DocumentComplexityMetrics {
  return {
    page_count: 2,
    columns_detected: 0,
    tables_detected: 0,
    table_rows_detected: 0,
    text_boxes_detected: 0,
    drawings_detected: 0,
    images_detected: 0,
    fonts: ['Helvetica', 'Arial'],
    non_embedded_fonts: [],
    symbol_fonts: [],
    header_footer_lines_removed: 2,
    link_count: 2,
    docx_columns_detected: false,
    ...overrides,
  };
}

export function makeStats(overrides: Partial<LlmCallStats> = {}): LlmCallStats {
  return {
    purpose: 'test',
    model: 'gpt-4o-mini',
    temperature: 0,
    duration_ms: 12,
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    attempts: 1,
    ok: true,
    ...overrides,
  };
}

/**
 * Bag-of-words embedding used by matcher and pipeline tests.
 *
 * Real cosine similarity in the pipeline is computed locally from vectors, so this
 * fake is a legitimate stand-in: it produces a stable 24-dimension hashed vector
 * and therefore deterministic similarities without any network access.
 */
export function hashEmbedding(text: string, dimensions = 512): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 1);

  for (const token of tokens) {
    let hash = 2_166_136_261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    vector[Math.abs(hash) % dimensions] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

/**
 * Injected `embed` implementation matching `embedStrings`' contract: a Map keyed by
 * the original string plus call stats. No network, fully deterministic.
 */
export async function fakeEmbed(values: string[]): Promise<{
  vectors: Map<string, number[]>;
  stats: LlmCallStats;
  cacheHits: number;
  embeddedCount: number;
}> {
  return {
    vectors: new Map(values.map((value) => [value, hashEmbedding(value)])),
    stats: makeStats({ purpose: 'embed:test', total_tokens: values.length * 5 }),
    cacheHits: 0,
    embeddedCount: values.length,
  };
}
