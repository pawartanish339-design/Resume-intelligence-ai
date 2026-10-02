import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AnalysisRow, JobDescriptionRow, ResumeRow, ResumeVersionRow } from '@/lib/db/types';
import type { AnalysisResult, MatchCategory, Recommendation, ScoreComponentDetail } from '@/types/analysis';
import type { ResumeListItem, ResumeVersionListItem } from '@/types/resume';

/**
 * Read helpers for server components.
 *
 * These run with the caller's session (RLS applies) and always filter by `user_id`,
 * so a server component cannot accidentally render another tenant's rows. Anything
 * that must be counted across accounts belongs in the admin service instead.
 */

interface VersionJoinRow extends Pick<
  ResumeVersionRow,
  'id' | 'resume_id' | 'version_number' | 'label' | 'raw_text_length' | 'extraction_method' | 'created_at'
> {
  ats_metrics: { ats?: { score?: number } } | null;
}

export interface DashboardAnalysisRow {
  id: string;
  created_at: string;
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  skill_score: number;
  weight_profile: string;
  jobTitle: string | null;
  resumeFilename: string | null;
  versionNumber: number | null;
}

export interface DashboardData {
  profile: { email: string | null; status: string; created_at: string } | null;
  resumes: ResumeListItem[];
  recent: DashboardAnalysisRow[];
  trend: Array<{ date: string; overall: number; jobMatch: number; ats: number }>;
  totals: {
    resumes: number;
    versions: number;
    analyses: number;
    averageOverall: number | null;
    bestOverall: number | null;
  };
  latest: DashboardAnalysisRow | null;
}

export async function getDashboardData(
  supabase: SupabaseClient,
  userId: string,
): Promise<DashboardData> {
  const [profileResult, resumesResult, analysesResult, analysisCountResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('email, status, created_at')
      .eq('id', userId)
      .maybeSingle<{ email: string | null; status: string; created_at: string }>(),
    supabase
      .from('resumes')
      .select(
        'id, filename, file_type, file_size_bytes, created_at, updated_at, resume_versions(id, resume_id, version_number, label, raw_text_length, extraction_method, created_at, ats_metrics)',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('analyses')
      .select(
        'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, job_descriptions(title), resume_versions(version_number, resumes(filename))',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('analyses').select('id', { head: true, count: 'exact' }).eq('user_id', userId),
  ]);

  const resumeRows = (resumesResult.data ?? []) as unknown as Array<
    Pick<ResumeRow, 'id' | 'filename' | 'file_type' | 'file_size_bytes' | 'created_at' | 'updated_at'> & {
      resume_versions: VersionJoinRow[] | null;
    }
  >;

  const versionIds = resumeRows.flatMap((resume) => (resume.resume_versions ?? []).map((version) => version.id));
  const analysisCounts = new Map<string, number>();

  if (versionIds.length > 0) {
    const { data: counts } = await supabase
      .from('analyses')
      .select('resume_version_id')
      .in('resume_version_id', versionIds)
      .limit(5_000);

    for (const row of (counts ?? []) as Array<{ resume_version_id: string }>) {
      analysisCounts.set(row.resume_version_id, (analysisCounts.get(row.resume_version_id) ?? 0) + 1);
    }
  }

  const resumes: ResumeListItem[] = resumeRows.map((resume) => {
    const versions: ResumeVersionListItem[] = (resume.resume_versions ?? [])
      .slice()
      .sort((a, b) => b.version_number - a.version_number)
      .map((version) => ({
        id: version.id,
        version_number: version.version_number,
        label: version.label,
        raw_text_length: version.raw_text_length,
        extraction_method: version.extraction_method,
        created_at: version.created_at,
        ats_score: version.ats_metrics?.ats?.score ?? null,
        analysis_count: analysisCounts.get(version.id) ?? 0,
      }));

    return {
      id: resume.id,
      filename: resume.filename,
      file_type: resume.file_type,
      file_size_bytes: resume.file_size_bytes,
      created_at: resume.created_at,
      updated_at: resume.updated_at,
      versions,
    };
  });

  type AnalysisJoinRow = Pick<
    AnalysisRow,
    'id' | 'created_at' | 'overall_score' | 'job_match_score' | 'ats_score' | 'skill_score' | 'weight_profile'
  > & {
    job_descriptions: { title: string } | null;
    resume_versions: { version_number: number; resumes: { filename: string } | null } | null;
  };

  const recent: DashboardAnalysisRow[] = ((analysesResult.data ?? []) as unknown as AnalysisJoinRow[]).map(
    (analysis) => ({
      id: analysis.id,
      created_at: analysis.created_at,
      overall_score: Number(analysis.overall_score),
      job_match_score: Number(analysis.job_match_score),
      ats_score: Number(analysis.ats_score),
      skill_score: Number(analysis.skill_score),
      weight_profile: analysis.weight_profile,
      jobTitle: analysis.job_descriptions?.title ?? null,
      resumeFilename: analysis.resume_versions?.resumes?.filename ?? null,
      versionNumber: analysis.resume_versions?.version_number ?? null,
    }),
  );

  const overalls = recent.map((analysis) => analysis.overall_score);

  return {
    profile: profileResult.data ?? null,
    resumes,
    recent,
    trend: [...recent]
      .reverse()
      .map((analysis) => ({
        date: analysis.created_at,
        overall: analysis.overall_score,
        jobMatch: analysis.job_match_score,
        ats: analysis.ats_score,
      })),
    totals: {
      resumes: resumes.length,
      versions: resumes.reduce((total, resume) => total + resume.versions.length, 0),
      analyses: analysisCountResult.count ?? recent.length,
      averageOverall:
        overalls.length === 0 ? null : Math.round((overalls.reduce((a, b) => a + b, 0) / overalls.length) * 100) / 100,
      bestOverall: overalls.length === 0 ? null : Math.max(...overalls),
    },
    latest: recent[0] ?? null,
  };
}

export interface ResumeDetail {
  resume: Pick<ResumeRow, 'id' | 'filename' | 'file_type' | 'file_size_bytes' | 'created_at'>;
  versions: Array<ResumeVersionListItem & { version_id: string }>;
  analysesByVersion: Map<string, DashboardAnalysisRow[]>;
}

export async function getResumeDetail(
  supabase: SupabaseClient,
  userId: string,
  resumeId: string,
): Promise<ResumeDetail | null> {
  const { data, error } = await supabase
    .from('resumes')
    .select(
      'id, filename, file_type, file_size_bytes, created_at, resume_versions(id, resume_id, version_number, label, raw_text_length, extraction_method, created_at, ats_metrics)',
    )
    .eq('id', resumeId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle<
      Pick<ResumeRow, 'id' | 'filename' | 'file_type' | 'file_size_bytes' | 'created_at'> & {
        resume_versions: VersionJoinRow[] | null;
      }
    >();

  if (error) throw error;
  if (!data) return null;

  const versionIds = (data.resume_versions ?? []).map((version) => version.id);
  const analysesByVersion = new Map<string, DashboardAnalysisRow[]>();

  if (versionIds.length > 0) {
    const { data: analyses } = await supabase
      .from('analyses')
      .select(
        'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, resume_version_id, job_descriptions(title)',
      )
      .eq('user_id', userId)
      .in('resume_version_id', versionIds)
      .order('created_at', { ascending: false })
      .limit(200);

    for (const row of (analyses ?? []) as unknown as Array<
      Omit<DashboardAnalysisRow, 'resumeFilename' | 'versionNumber'> & {
        resume_version_id: string;
        job_descriptions: { title: string } | null;
      }
    >) {
      const list = analysesByVersion.get(row.resume_version_id) ?? [];
      list.push({
        id: row.id,
        created_at: row.created_at,
        overall_score: Number(row.overall_score),
        job_match_score: Number(row.job_match_score),
        ats_score: Number(row.ats_score),
        skill_score: Number(row.skill_score),
        weight_profile: row.weight_profile,
        jobTitle: row.job_descriptions?.title ?? null,
        resumeFilename: data.filename,
        versionNumber: null,
      });
      analysesByVersion.set(row.resume_version_id, list);
    }
  }

  return {
    resume: {
      id: data.id,
      filename: data.filename,
      file_type: data.file_type,
      file_size_bytes: data.file_size_bytes,
      created_at: data.created_at,
    },
    versions: (data.resume_versions ?? [])
      .slice()
      .sort((a, b) => b.version_number - a.version_number)
      .map((version) => ({
        id: version.id,
        version_id: version.id,
        version_number: version.version_number,
        label: version.label,
        raw_text_length: version.raw_text_length,
        extraction_method: version.extraction_method,
        created_at: version.created_at,
        ats_score: version.ats_metrics?.ats?.score ?? null,
        analysis_count: (analysesByVersion.get(version.id) ?? []).length,
      })),
    analysesByVersion,
  };
}

export interface AnalysisSkillRow {
  skill: string;
  category: MatchCategory;
  credit: number;
  cosine_similarity: number | null;
  evidence_found: boolean;
  evidence: Array<{ snippet: string; origin: string; company?: string | null; title?: string | null }>;
  reason: string | null;
  weak: boolean;
}

export interface AnalysisDetail {
  analysis: Pick<
    AnalysisRow,
    | 'id'
    | 'created_at'
    | 'overall_score'
    | 'job_match_score'
    | 'ats_score'
    | 'skill_score'
    | 'weight_profile'
    | 'processing_ms'
    | 'score_breakdown'
    | 'recommendations'
  >;
  jobDescription: Pick<JobDescriptionRow, 'id' | 'title' | 'company_name'> | null;
  resume: {
    versionId: string;
    versionNumber: number;
    label: string | null;
    filename: string;
    extractionMethod: string | null;
    rawTextLength: number | null;
  } | null;
  skills: AnalysisSkillRow[];
  safety: { flagged: boolean; matches: string[]; documents: Array<'resume' | 'job_description'> };
  notes: string[];
}

export async function getAnalysisDetail(
  supabase: SupabaseClient,
  userId: string,
  analysisId: string,
): Promise<AnalysisDetail | null> {
  const { data, error } = await supabase
    .from('analyses')
    .select(
      'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, processing_ms, score_breakdown, recommendations, job_descriptions(id, title, company_name), resume_versions(id, version_number, label, extraction_method, raw_text_length, resumes(filename))',
    )
    .eq('id', analysisId)
    .eq('user_id', userId)
    .maybeSingle<
      Pick<
        AnalysisRow,
        | 'id'
        | 'created_at'
        | 'overall_score'
        | 'job_match_score'
        | 'ats_score'
        | 'skill_score'
        | 'weight_profile'
        | 'processing_ms'
        | 'score_breakdown'
        | 'recommendations'
      > & {
        job_descriptions: Pick<JobDescriptionRow, 'id' | 'title' | 'company_name'> | null;
        resume_versions:
          | (Pick<ResumeVersionRow, 'id' | 'version_number' | 'label' | 'extraction_method' | 'raw_text_length'> & {
              resumes: { filename: string } | null;
            })
          | null;
      }
    >();

  if (error) throw error;
  if (!data) return null;

  const { data: skillRows } = await supabase
    .from('extracted_skills')
    .select('skill_name, match_category, cosine_similarity, evidence_found')
    .eq('analysis_id', analysisId)
    .order('match_category', { ascending: true })
    .order('skill_name', { ascending: true })
    .limit(500);

  const breakdown = data.score_breakdown as AnalysisResult['scores'] extends never
    ? never
    : {
        safety?: { flagged: boolean; matches: string[]; documents: Array<'resume' | 'job_description'> };
        extraction?: { warnings?: Array<{ field: string; value: string; reason: string }> };
      };

  return {
    analysis: {
      id: data.id,
      created_at: data.created_at,
      overall_score: Number(data.overall_score),
      job_match_score: Number(data.job_match_score),
      ats_score: Number(data.ats_score),
      skill_score: Number(data.skill_score),
      weight_profile: data.weight_profile,
      processing_ms: data.processing_ms,
      score_breakdown: data.score_breakdown,
      recommendations: data.recommendations,
    },
    jobDescription: data.job_descriptions ?? null,
    resume: data.resume_versions
      ? {
          versionId: data.resume_versions.id,
          versionNumber: data.resume_versions.version_number,
          label: data.resume_versions.label,
          filename: data.resume_versions.resumes?.filename ?? 'resume',
          extractionMethod: data.resume_versions.extraction_method,
          rawTextLength: data.resume_versions.raw_text_length,
        }
      : null,
    skills: ((skillRows ?? []) as Array<{
      skill_name: string;
      match_category: MatchCategory;
      cosine_similarity: number | null;
      evidence_found: boolean;
    }>).map((row) => ({
      skill: row.skill_name,
      category: row.match_category,
      // Credit is recomputed for display only; the stored score remains authoritative.
      credit: row.evidence_found ? 1 : 0,
      cosine_similarity: row.cosine_similarity === null ? null : Number(row.cosine_similarity),
      evidence_found: row.evidence_found,
      evidence: [],
      reason: null,
      weak: false,
    })),
    safety: breakdown?.safety ?? { flagged: false, matches: [], documents: [] },
    notes: (breakdown?.extraction?.warnings ?? []).map(
      (warning) => `${warning.field}: ${warning.reason}`,
    ),
  };
}

export interface AnalysisOption {
  id: string;
  created_at: string;
  title: string | null;
  weight_profile: string;
  overall_score: number;
}

export async function getAnalysisOptions(
  supabase: SupabaseClient,
  userId: string,
): Promise<AnalysisOption[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('id, created_at, overall_score, weight_profile, job_descriptions(title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    id: string;
    created_at: string;
    overall_score: number;
    weight_profile: string;
    job_descriptions: { title: string } | null;
  }>).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    title: row.job_descriptions?.title ?? null,
    weight_profile: row.weight_profile,
    overall_score: Number(row.overall_score),
  }));
}

/** Component rows recovered from the persisted breakdown, for the report page. */
export function componentRowsFromBreakdown(
  breakdown: unknown,
): { components: ScoreComponentDetail[]; weightTotal: number } {
  const parsed = breakdown as { components?: Array<{ component: string; score: number; weight: number; detail: string }> };

  const components = (parsed?.components ?? []).map((component) => ({
    component: component.component as ScoreComponentDetail['component'],
    label: `${component.component
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase())}`,
    score: component.score,
    weight: component.weight,
    weighted_score: Math.round(component.score * component.weight * 100) / 100,
    applicable: true,
    detail: component.detail,
  }));

  return {
    components,
    weightTotal: components.reduce((total, component) => total + component.weight, 0),
  };
}

/** Recommendations are stored as JSON; this narrows them for the UI. */
export function recommendationsFromBreakdown(value: unknown): Recommendation[] {
  return Array.isArray(value) ? (value as Recommendation[]) : [];
}
