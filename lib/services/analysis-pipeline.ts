import type { SupabaseClient } from '@supabase/supabase-js';

import type { CanonicalJD, CanonicalResume, ExtractionQuality, ExtractionValidation } from '@/lib/ai/schemas';
import { extractJobDescriptionFromText, mergeSafetyNotices, type JdExtractionResult } from '@/lib/ai/extract';
import { buildRecommendations } from '@/lib/ai/recommend';
import { DISCLAIMERS } from '@/lib/ai/prompts';
import { measure } from '@/lib/utils/timing';
import { omitUndefined } from '@/lib/utils/serialize';
import { suggestWeightProfile, type WeightProfileId } from '@/lib/data/weight-profiles';
import { analyzeAts } from '@/lib/services/ats';
import { analyzeQuality } from '@/lib/services/quality';
import { analyzeExperience } from '@/lib/services/experience';
import { generateResumeSuggestions } from '@/lib/services/suggestions';
import { classifySkillMatches, type MatcherOutput } from '@/lib/services/matcher';
import { buildSkillGaps } from '@/lib/services/gaps';
import { computeScores, coverageScore } from '@/lib/services/scoring';
import { recordAnalyticsEvent } from '@/lib/services/audit';
import { errorMessage, logSafe } from '@/lib/utils/errors';
import { roundTo } from '@/lib/utils/cache';
import type { DocumentComplexityMetrics } from '@/types/resume';
import type {
  AnalysisResult,
  HardRequirementCheck,
  PersistedScoreBreakdown,
  PipelineTimings,
  PromptInjectionNotice,
  SkillMatch,
} from '@/types/analysis';

/**
 * End-to-end analysis orchestration.
 *
 * Stage order (with the only real parallelism where it is safe):
 *   [resume texture assembly + JD extraction]  (parallel)
 *        -> skill matching (embeddings, one batched call)
 *        -> ATS / quality / experience / scoring  (pure, instantaneous)
 *        -> gap analysis (deterministic) -> recommendations (bounded LLM)
 *        -> persistence + analytics
 *
 * The resume is NOT re-parsed here: parsing and LLM extraction happen at upload
 * time, which keeps the analyze route inside its latency budget and means a stored
 * version can be re-analyzed against many job descriptions with no re-extraction.
 */

export interface ResumeVersionInput {
  id: string;
  resume_id: string;
  version_number: number;
  extracted_data: CanonicalResume;
  raw_text_length: number | null;
  extraction_method: string | null;
  ats_metrics: ResumeStoredMetrics | null;
}

export interface ResumeStoredMetrics {
  version?: number;
  ats?: { score: number; checks: unknown[]; findings: string[] };
  complexity?: DocumentComplexityMetrics;
  quality?: ExtractionQuality;
  validation_warnings?: ExtractionValidation['warnings'];
  method?: string;
  timings?: Record<string, number>;
  warnings?: string[];
}

/**
 * Rebuild a text corpus from the validated extraction.
 *
 * This is what evidence search, hard-requirement checks and ATS text analysis run
 * against. It is faithful to the document because `validateExtraction` already
 * removed every value that could not be found in the original text, and it avoids
 * persisting or re-processing the full raw document text.
 */
export function buildResumeCorpus(resume: CanonicalResume): string {
  const parts: string[] = [];

  if (resume.summary) {
    parts.push('SUMMARY');
    parts.push(resume.summary);
  }

  const contact = resume.contact ?? ({} as CanonicalResume['contact']);
  const contactBits = [contact.email, contact.phone, contact.location, contact.linkedin_url, contact.github_url, contact.portfolio_url]
    .filter((value): value is string => Boolean(value));
  if (contactBits.length > 0) parts.push(contactBits.join(' | '));

  // Conventional section headings are re-emitted so the structural (ATS) checks run
  // against the same section signals a machine reader sees in the original document.
  if ((resume.experience ?? []).length > 0) parts.push('EXPERIENCE');
  if ((resume.projects ?? []).length > 0) parts.push('PROJECTS');
  if ((resume.education ?? []).length > 0) parts.push('EDUCATION');

  for (const entry of resume.education ?? []) {
    parts.push(
      [entry.degree, entry.field_of_study, entry.institution, entry.start_date, entry.end_date, entry.gpa]
        .filter(Boolean)
        .join(', '),
    );
    for (const honor of entry.honors ?? []) parts.push(honor);
  }

  for (const job of resume.experience ?? []) {
    parts.push([job.title, job.company, job.location, job.start_date, job.end_date].filter(Boolean).join(', '));
    for (const bullet of job.bullet_points ?? []) parts.push(bullet);
    if ((job.technologies_used ?? []).length > 0) {
      parts.push(`Technologies: ${(job.technologies_used ?? []).join(', ')}`);
    }
  }

  for (const project of resume.projects ?? []) {
    parts.push([project.title, project.description, project.link].filter(Boolean).join(', '));
    for (const bullet of project.bullet_points ?? []) parts.push(bullet);
    if ((project.technologies_used ?? []).length > 0) {
      parts.push(`Technologies: ${(project.technologies_used ?? []).join(', ')}`);
    }
  }

  const skills = resume.skills ?? ({} as CanonicalResume['skills']);
  const hasSkills = [
    ...(skills.technical ?? []),
    ...(skills.frameworks_and_tools ?? []),
    ...(skills.soft_skills ?? []),
    ...(skills.languages ?? []),
  ].length > 0;
  if (hasSkills) parts.push('SKILLS');
  if ((resume.certifications ?? []).length > 0) parts.push('CERTIFICATIONS');
  if ((resume.achievements ?? []).length > 0) parts.push('ACHIEVEMENTS');

  const skillBits = [
    ...(skills.technical ?? []),
    ...(skills.frameworks_and_tools ?? []),
    ...(skills.soft_skills ?? []),
    ...(skills.languages ?? []),
  ];
  if (skillBits.length > 0) parts.push(`Skills: ${skillBits.join(', ')}`);

  for (const certification of resume.certifications ?? []) {
    parts.push([certification.name, certification.issuer, certification.date_obtained].filter(Boolean).join(', '));
  }

  for (const achievement of resume.achievements ?? []) parts.push(achievement);

  return parts.filter((part) => part && part.trim().length > 0).join('\n');
}

export interface AnalysisPipelineDeps {
  extractJobDescription?: (text: string, options?: { maskPii?: boolean }) => Promise<JdExtractionResult>;
  classify?: typeof classifySkillMatches;
  recommend?: typeof buildRecommendations;
}

export interface RunAnalysisInput {
  userId: string;
  supabase: SupabaseClient;
  resumeVersion: ResumeVersionInput;
  jdText: string;
  title?: string;
  companyName?: string | null;
  weightProfile?: WeightProfileId | null;
  maskPii?: boolean;
  persist?: boolean;
  deps?: AnalysisPipelineDeps;
}

export interface RunAnalysisOutput {
  result: AnalysisResult;
  jobDescriptionId: string | null;
}

export async function runAnalysisPipeline(input: RunAnalysisInput): Promise<RunAnalysisOutput> {
  const startedAt = Date.now();
  const notes: string[] = [];

  const storedMetrics = input.resumeVersion.ats_metrics ?? {};
  const complexity: DocumentComplexityMetrics = storedMetrics.complexity ?? {
    page_count: 1,
    columns_detected: 0,
    tables_detected: 0,
    table_rows_detected: 0,
    text_boxes_detected: 0,
    drawings_detected: 0,
    images_detected: 0,
    fonts: [],
    non_embedded_fonts: [],
    symbol_fonts: [],
    header_footer_lines_removed: 0,
    link_count: 0,
    docx_columns_detected: false,
  };

  const extractionQuality = storedMetrics.quality ?? null;
  const validationWarnings = storedMetrics.validation_warnings ?? [];

  if (validationWarnings.length > 0) {
    notes.push(
      `${validationWarnings.length} extracted value(s) were removed because they could not be found in the document text.`,
    );
  }

  // ---- Stage 1: resume-side deterministics (parallel with JD extraction) ----
  const parseTimer = measure();
  const resumeCorpus = buildResumeCorpus(input.resumeVersion.extracted_data);
  const quality = analyzeQuality(input.resumeVersion.extracted_data);

  // The upload route measured ATS compatibility against the real parsed document
  // (fonts, tables, columns, headings). Re-deriving it from the reconstructed corpus
  // would let the two surfaces disagree, so the stored measurement wins when present.
  const storedAts = storedMetrics.ats;
  const ats = storedAts
    ? {
        score: storedAts.score,
        checks: (storedAts.checks ?? []) as AnalysisResult['ats']['checks'],
        findings: storedAts.findings ?? [],
      }
    : analyzeAts({
        text: resumeCorpus,
        complexity,
        quality: extractionQuality ? { dictionaryRatio: extractionQuality.dictionaryRatio } : null,
      });
  const parse_ms = parseTimer();

  // ---- Stage 2: job description extraction (bounded LLM) -------------------
  const extractTimer = measure();
  const extractJd =
    input.deps?.extractJobDescription ??
    ((text: string, options?: { maskPii?: boolean }) =>
      extractJobDescriptionFromText(text, {
        maskPii: options?.maskPii,
        piiOptions: {
          maskEmails: false,
          maskSocialUrls: false,
          maskAddress: true,
          maskPhone: true,
        },
      }));

  const jdExtraction = await extractJd(input.jdText, { maskPii: input.maskPii ?? false });
  const jobDescription: CanonicalJD = jdExtraction.jobDescription;
  const extract_ms = extractTimer();

  // ---- Stage 3: skill matching (embeddings) -------------------------------
  const classify = input.deps?.classify ?? classifySkillMatches;
  const matcher: MatcherOutput = await classify({
    resume: input.resumeVersion.extracted_data,
    jobDescription,
    resumeText: resumeCorpus,
    jdText: input.jdText,
  });

  // ---- Stage 4: scoring inputs --------------------------------------------
  const scoreTimer = measure();

  const experience = analyzeExperience({
    resume: input.resumeVersion.extracted_data,
    jobDescription,
    responsibilitySimilarities: matcher.responsibilitySimilarities,
    projectSimilarities: matcher.projectSimilarities,
  });

  const unmetHardRequirements = matcher.hardRequirements.filter((check) => !check.verified);

  const requiredCredits = matcher.required.map((match) => match.credit);
  const preferredCredits = matcher.preferred.map((match) => match.credit);

  const requiredSkillsScore = coverageScore(requiredCredits);
  const preferredSkillsScore = coverageScore(preferredCredits, { neutralWhenEmpty: true });

  const profileSelection = input.weightProfile
    ? { profile: input.weightProfile, reason: 'Selected manually.', matchedKeyword: null }
    : suggestWeightProfile(jobDescription.meta?.job_title ?? input.title ?? '', input.jdText);

  const hardRequirementNote =
    unmetHardRequirements.length > 0
      ? `Required skill coverage is capped at 70 because ${unmetHardRequirements.length} non-negotiable requirement(s) could not be verified from your document: ${unmetHardRequirements
          .slice(0, 3)
          .map((check) => `"${check.requirement}"`)
          .join(', ')}.`
      : null;

  const { breakdown } = computeScores({
    components: {
      required_skills: requiredSkillsScore,
      preferred_skills: preferredSkillsScore,
      semantic_match: matcher.semanticAlignment,
      experience_relevance: experience.score,
      ats_parseability: ats.score,
      content_quality: quality.score,
      achievements: quality.achievements_index,
    },
    weightProfile: profileSelection.profile,
    counts: {
      requiredSkills: matcher.required.length,
      preferredSkills: matcher.preferred.length,
      responsibilities: jobDescription.responsibilities?.length ?? 0,
    },
    unmetHardRequirement: unmetHardRequirements.length > 0,
    hardRequirementNote,
    details: {
      required_skills: `${matcher.required.filter((match) => match.credit > 0).length} of ${matcher.required.length} required skills matched.`,
      preferred_skills: matcher.preferred.length === 0
        ? 'The posting lists no preferred skills, so this component is neutral.'
        : `${matcher.preferred.filter((match) => match.credit > 0).length} of ${matcher.preferred.length} preferred skills matched.`,
      semantic_match: 'Average conceptual alignment between job responsibilities and your document.',
      experience_relevance: `${experience.total_years} year(s) of documented experience; relevance ${experience.relevance_score}.`,
      ats_parseability: ats.checks.map((check) => `${check.name}: ${Math.round(check.value * 100)}%`).join('; '),
      content_quality: `${quality.bullet_count} achievement line(s) analysed; ${quality.quantified_bullet_ratio}% quantified.`,
      achievements: 'Measurable outcomes per achievement line, scaled so ~50% quantified lines scores 100.',
    },
  });
  const score_ms = scoreTimer();

  // ---- Stage 5: gaps + recommendations -------------------------------------
  const recommendTimer = measure();
  const gaps = buildSkillGaps({
    matches: [...matcher.required, ...matcher.preferred, ...matcher.other],
    jdText: input.jdText,
    resume: input.resumeVersion.extracted_data,
    resumeText: resumeCorpus,
    extra: unmetHardRequirements.map((check) => ({
      skill: check.requirement,
      source: 'required' as const,
      priority: 'high' as const,
      detection: `Unverified hard requirement: ${check.detail}`,
    })),
  });

  const recommend = input.deps?.recommend ?? buildRecommendations;
  const { recommendations, llmStats } = await recommend({
    gaps,
    jdText: input.jdText,
    resumeText: resumeCorpus,
  });
  const recommend_ms = recommendTimer();

  const suggestions = generateResumeSuggestions({
    resume: input.resumeVersion.extracted_data,
    jobDescription,
    matches: [...matcher.required, ...matcher.preferred, ...matcher.other],
    gaps,
    quality,
    ats,
    experience,
    hardRequirements: matcher.hardRequirements,
  });

  // ---- Stage 6: bookkeeping ------------------------------------------------
  const safety: PromptInjectionNotice = mergeSafetyNotices([jdExtraction.safety.notice]);

  const timings: PipelineTimings = {
    parse_ms,
    extract_ms,
    embed_ms: matcher.embedDurationMs,
    score_ms,
    recommend_ms,
    total_ms: Date.now() - startedAt,
  };

  if (extractionQuality && !extractionQuality.passed) {
    notes.push('The uploaded document failed the extraction quality gate; results may be less reliable.');
  }
  if (input.resumeVersion.extraction_method === 'ocr') {
    notes.push(
      'Text was recovered with OCR, so layout-derived findings (columns, tables) are approximate.',
    );
  }
  if (safety.flagged) {
    notes.push(
      'Instruction-like text was detected in the job description and neutralised before extraction. It had no effect on scoring.',
    );
  }

  const allLlmStats = [
    ...(jdExtraction.stats ? [jdExtraction.stats] : []),
    ...matcher.embedStats,
    ...llmStats,
  ];

  const llmUsage = {
    calls: allLlmStats.length,
    total_tokens: allLlmStats.reduce((total, stats) => total + stats.total_tokens, 0),
    total_ms: allLlmStats.reduce((total, stats) => total + stats.duration_ms, 0),
    by_purpose: allLlmStats.reduce<Record<string, number>>((acc, stats) => {
      acc[stats.purpose] = (acc[stats.purpose] ?? 0) + stats.total_tokens;
      return acc;
    }, {}),
    details: allLlmStats,
  };

  const jdTitle = (input.title ?? jobDescription.meta?.job_title ?? 'Untitled role').slice(0, 255);
  const jdCompany = (input.companyName ?? jobDescription.meta?.company_name ?? null) ?? null;

  const persistedBreakdown: PersistedScoreBreakdown = {
    version: 1,
    components: Object.values(breakdown.components).map((component) => ({
      component: component.component,
      score: component.score,
      weight: component.weight,
      detail: component.detail,
    })),
    ats_checks: ats.checks,
    quality: {
      score: quality.score,
      action_verb_density: quality.action_verb_density,
      quantified_bullet_ratio: quality.quantified_bullet_ratio,
      findings: quality.findings,
    },
    hard_requirements: matcher.hardRequirements,
    extraction: {
      method: input.resumeVersion.extraction_method ?? 'unknown',
      quality: extractionQuality,
      warnings: validationWarnings,
    },
    safety,
    timings,
    suggestions,
  };

  let jobDescriptionId: string | null = null;
  let analysisId: string | null = null;

  if (input.persist ?? true) {
    const { data: jdRow, error: jdError } = await input.supabase
      .from('job_descriptions')
      .insert({
        user_id: input.userId,
        title: jdTitle,
        company_name: jdCompany,
        raw_text: input.jdText,
        structured_data: jobDescription as unknown as Record<string, unknown>,
      })
      .select('id')
      .single<{ id: string }>();

    if (jdError) throw jdError;
    jobDescriptionId = jdRow?.id ?? null;

    const { data: analysisRow, error: analysisError } = await input.supabase
      .from('analyses')
      .insert({
        user_id: input.userId,
        resume_version_id: input.resumeVersion.id,
        job_description_id: jobDescriptionId,
        overall_score: breakdown.overall_score,
        job_match_score: breakdown.job_match_score,
        ats_score: breakdown.ats_score,
        skill_score: breakdown.skill_score,
        score_breakdown: persistedBreakdown as unknown as Record<string, unknown>,
        recommendations: recommendations as unknown as Record<string, unknown>,
        weight_profile: breakdown.weight_profile,
        processing_ms: timings.total_ms,
      })
      .select('id')
      .single<{ id: string }>();

    if (analysisError) throw analysisError;
    analysisId = analysisRow?.id ?? null;

    if (analysisId) {
      const skillRows: SkillMatch[] = [...matcher.required, ...matcher.preferred];
      if (skillRows.length > 0) {
        const { error: skillsError } = await input.supabase.from('extracted_skills').insert(
          skillRows.map((match) => ({
            analysis_id: analysisId,
            skill_name: match.skill.slice(0, 128),
            match_category: match.category,
            cosine_similarity: match.cosine_similarity,
            evidence_found: match.evidence_found,
          })),
        );
        if (skillsError) logSafe('Failed to persist extracted skills', { error: skillsError.message });
      }
    }

    // Telemetry: durations per stage, no document content.
    await recordAnalyticsEvent({
      eventType: 'analysis_created',
      userId: input.userId,
      metadata: {
        analysis_id: analysisId,
        weight_profile: breakdown.weight_profile,
        overall_score: breakdown.overall_score,
        overall_bucket: Math.floor(breakdown.overall_score / 10) * 10,
        tag_counts: countTags(matcher),
        required_skills: matcher.required.length,
        preferred_skills: matcher.preferred.length,
        gaps: gaps.length,
        recommendations_llm: recommendations.filter((item) => item.generated_by === 'llm').length,
        recommendations_template: recommendations.filter((item) => item.generated_by === 'template').length,
        safety_flagged: safety.flagged,
        ...timings,
      },
    });

    for (const stats of allLlmStats) {
      await recordAnalyticsEvent({
        eventType: stats.ok ? 'llm_call' : 'llm_call_failed',
        userId: input.userId,
        metadata: {
          purpose: stats.purpose,
          model: stats.model,
          duration_ms: stats.duration_ms,
          total_tokens: stats.total_tokens,
          attempts: stats.attempts,
        },
      });
    }
  }

  const result: AnalysisResult = {
    analysis_id: analysisId,
    created_at: new Date().toISOString(),
    weight_profile: breakdown.weight_profile,
    weight_profile_reason: profileSelection.reason,
    resume: {
      version_id: input.resumeVersion.id,
      resume_id: input.resumeVersion.resume_id,
      filename: '',
      extraction_method: input.resumeVersion.extraction_method ?? 'unknown',
      raw_text_length: input.resumeVersion.raw_text_length ?? resumeCorpus.length,
      quality: extractionQuality,
      validation: validationWarnings.length > 0 ? { validated: false, warnings: validationWarnings } : { validated: true, warnings: [] },
      data: input.resumeVersion.extracted_data,
    },
    job_description: {
      id: jobDescriptionId ?? '',
      title: jdTitle,
      company_name: jdCompany,
      raw_text_length: input.jdText.length,
      data: jobDescription,
    },
    scores: breakdown,
    skills: {
      required: matcher.required,
      preferred: matcher.preferred,
      other: matcher.other,
      hard_requirements: matcher.hardRequirements,
      required_coverage: roundTo(requiredSkillsScore, 2),
      preferred_coverage: roundTo(preferredSkillsScore, 2),
      semantic_alignment: roundTo(matcher.semanticAlignment, 2),
    },
    ats,
    quality,
    experience,
    gaps,
    recommendations,
    suggestions,
    safety,
    timings,
    llm_usage: llmUsage,
    notes,
    disclaimers: {
      primary: DISCLAIMERS.primary,
      semantic: DISCLAIMERS.semantic,
      document_quality: DISCLAIMERS.documentQuality,
      ethics: DISCLAIMERS.ethics,
      fairness: DISCLAIMERS.fairness,
    },
  };

  // `notes` must be present even when empty; keep undefined-free payloads.
  return { result: omitUndefined(result) as AnalysisResult, jobDescriptionId };
}

function countTags(matcher: MatcherOutput): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const match of [...matcher.required, ...matcher.preferred]) {
    counts[match.category] = (counts[match.category] ?? 0) + 1;
  }
  return counts;
}

/** Convenience for callers that only need the hard-requirement summary. */
export function summarizeHardRequirements(checks: HardRequirementCheck[]): string {
  const unmet = checks.filter((check) => !check.verified);
  if (unmet.length === 0) return 'All stated non-negotiable requirements were found in your document.';
  return `${unmet.length} non-negotiable requirement(s) could not be verified: ${unmet
    .map((check) => check.requirement)
    .join('; ')}.`;
}

/** Exposed for tests and error reporting. */
export function describePipelineFailure(error: unknown): string {
  return errorMessage(error);
}
