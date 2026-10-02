import { z } from 'zod';

/**
 * Structured-output schemas.
 *
 * IMPORTANT: OpenAI structured outputs require every field to be REQUIRED, with
 * nullable types instead of optional ones. `.optional()` would silently break the
 * strict JSON schema mode, so it is never used here. Code that needs a default
 * applies it after parsing (see `applyResumeDefaults` / `applyJdDefaults`).
 */

export const CanonicalResumeSchema = z.object({
  contact: z.object({
    full_name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    linkedin_url: z.string().nullable(),
    github_url: z.string().nullable(),
    portfolio_url: z.string().nullable(),
  }),
  summary: z.string().nullable(),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string().nullable(),
      field_of_study: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      gpa: z.string().nullable(),
      honors: z.array(z.string()).nullable(),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      location: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      is_current: z.boolean(),
      bullet_points: z.array(z.string()),
      technologies_used: z.array(z.string()),
    }),
  ),
  projects: z.array(
    z.object({
      title: z.string(),
      description: z.string().nullable(),
      bullet_points: z.array(z.string()),
      technologies_used: z.array(z.string()),
      link: z.string().nullable(),
    }),
  ),
  skills: z.object({
    technical: z.array(z.string()),
    frameworks_and_tools: z.array(z.string()),
    soft_skills: z.array(z.string()),
    languages: z.array(z.string()),
  }),
  certifications: z.array(
    z.object({
      name: z.string(),
      issuer: z.string().nullable(),
      date_obtained: z.string().nullable(),
    }),
  ),
  achievements: z.array(z.string()).nullable(),
});

export type CanonicalResume = z.infer<typeof CanonicalResumeSchema>;

export const CanonicalJDSchema = z.object({
  meta: z.object({
    job_title: z.string(),
    company_name: z.string().nullable(),
    industry: z.string().nullable(),
    seniority_level: z.string().nullable(),
  }),
  requirements: z.object({
    required_skills: z
      .array(z.string())
      .describe('Mandatory technical and operational skills explicitly required'),
    preferred_skills: z.array(z.string()).describe('Nice-to-have or bonus qualifications'),
    hard_requirements: z
      .array(z.string())
      .describe('Non-negotiable constraints like security clearance or citizenship'),
    soft_skills: z.array(z.string()),
    education_level: z.array(z.string()),
    min_years_experience: z.number().nullable(),
  }),
  responsibilities: z.array(z.string()),
  tools_and_technologies: z.array(z.string()),
  domain_keywords: z
    .array(z.string())
    .describe('Industry terminology and contextual domain keywords'),
});

export type CanonicalJD = z.infer<typeof CanonicalJDSchema>;

// ---------------------------------------------------------------------------
// Recommendations (bounded LLM call, grounded in deterministic facts)
// ---------------------------------------------------------------------------

export const RecommendationSourceSchema = z.object({
  /** "job_description" | "resume" | "analysis" -- where the quote came from. */
  source: z.enum(['job_description', 'resume', 'analysis']),
  /** Section heading closest to the excerpt, when determinable. */
  section: z.string().nullable(),
  /** 1-indexed line number of the excerpt inside the source document. */
  line: z.number().nullable(),
  /** Verbatim excerpt -- MUST be a substring of the source text. */
  excerpt: z.string(),
});

export const LlmRecommendationSchema = z.object({
  requirement_excerpt: z
    .string()
    .describe('Verbatim sentence or clause copied from the job description that states the requirement'),
  detection_result: z
    .string()
    .describe('Short factual statement of what the deterministic matcher found, using the provided facts only'),
  related_assets: z
    .array(z.string())
    .describe('Skills, tools, or projects actually found in the resume that are adjacent to this requirement'),
  recommended_action: z
    .string()
    .describe(
      'Conditional guidance. Must start from what the candidate may already have and must never instruct them to claim a skill they do not have.',
    ),
});

export type LlmRecommendation = z.infer<typeof LlmRecommendationSchema>;

// ---------------------------------------------------------------------------
// Extraction envelopes (cache + audit friendly)
// ---------------------------------------------------------------------------

export const ExtractionQualitySchema = z.object({
  passed: z.boolean(),
  charCount: z.number(),
  dictionaryRatio: z.number(),
  whitespaceRatio: z.number(),
  longestGarbageRun: z.number(),
  reasons: z.array(z.string()),
});

export type ExtractionQuality = z.infer<typeof ExtractionQualitySchema>;

export const ExtractionValidationSchema = z.object({
  validated: z.boolean(),
  warnings: z.array(
    z.object({
      field: z.string(),
      value: z.string(),
      reason: z.string(),
    }),
  ),
});

export type ExtractionValidation = z.infer<typeof ExtractionValidationSchema>;

/** Bounded, schema-shaped view of a job description used by prompts. */
export const JdPromptPayloadSchema = z.object({
  title: z.string(),
  requirements: z.array(z.string()),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()),
});

export type JdPromptPayload = z.infer<typeof JdPromptPayloadSchema>;

// ---------------------------------------------------------------------------
// Post-parse default handling
// ---------------------------------------------------------------------------

/**
 * `is_current` has no `.default()` in the schema on purpose; if a model returns
 * `false` for a role whose end date reads "Present", we trust the date text.
 */
export function applyResumeDefaults(resume: CanonicalResume): CanonicalResume {
  return {
    ...resume,
    education: (resume.education ?? []).map((entry) => ({
      ...entry,
      honors: entry.honors ?? null,
    })),
    experience: (resume.experience ?? []).map((entry) => {
      const endLooksOpen = !entry.end_date || /present|current|now|ongoing|to date/i.test(entry.end_date);
      return {
        ...entry,
        is_current: entry.is_current || endLooksOpen,
        bullet_points: entry.bullet_points ?? [],
        technologies_used: entry.technologies_used ?? [],
      };
    }),
    projects: (resume.projects ?? []).map((entry) => ({
      ...entry,
      bullet_points: entry.bullet_points ?? [],
      technologies_used: entry.technologies_used ?? [],
    })),
    skills: {
      technical: resume.skills?.technical ?? [],
      frameworks_and_tools: resume.skills?.frameworks_and_tools ?? [],
      soft_skills: resume.skills?.soft_skills ?? [],
      languages: resume.skills?.languages ?? [],
    },
    certifications: resume.certifications ?? [],
    achievements: resume.achievements ?? null,
  };
}

export function applyJdDefaults(jd: CanonicalJD): CanonicalJD {
  return {
    ...jd,
    requirements: {
      ...jd.requirements,
      required_skills: jd.requirements?.required_skills ?? [],
      preferred_skills: jd.requirements?.preferred_skills ?? [],
      hard_requirements: jd.requirements?.hard_requirements ?? [],
      soft_skills: jd.requirements?.soft_skills ?? [],
      education_level: jd.requirements?.education_level ?? [],
      min_years_experience: jd.requirements?.min_years_experience ?? null,
    },
    responsibilities: jd.responsibilities ?? [],
    tools_and_technologies: jd.tools_and_technologies ?? [],
    domain_keywords: jd.domain_keywords ?? [],
  };
}

/** Convenience: every skill string mentioned anywhere in a resume. */
export function collectResumeSkillStrings(resume: CanonicalResume): string[] {
  const out = new Set<string>();
  for (const value of [
    ...(resume.skills?.technical ?? []),
    ...(resume.skills?.frameworks_and_tools ?? []),
    ...(resume.skills?.soft_skills ?? []),
    ...(resume.skills?.languages ?? []),
  ]) {
    if (value && value.trim()) out.add(value.trim());
  }
  for (const job of resume.experience ?? []) {
    for (const tech of job.technologies_used ?? []) {
      if (tech && tech.trim()) out.add(tech.trim());
    }
  }
  for (const project of resume.projects ?? []) {
    for (const tech of project.technologies_used ?? []) {
      if (tech && tech.trim()) out.add(tech.trim());
    }
  }
  return Array.from(out);
}

/** Every JD skill string that should be classified (required + preferred). */
export function collectJdSkillStrings(jd: CanonicalJD): string[] {
  const out = new Set<string>();
  for (const value of [
    ...(jd.requirements?.required_skills ?? []),
    ...(jd.requirements?.preferred_skills ?? []),
    ...(jd.tools_and_technologies ?? []),
  ]) {
    if (value && value.trim()) out.add(value.trim());
  }
  return Array.from(out);
}
