import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createRoute } from '@/lib/utils/route-helpers';
import { notFound } from '@/lib/utils/errors';

export const runtime = 'nodejs';
export const maxDuration = 30;

const paramsSchema = z.object({ id: z.string().uuid('Invalid analysis id') });

interface AnalysisQueryRow {
  id: string;
  created_at: string;
  overall_score: number;
  job_match_score: number;
  ats_score: number;
  skill_score: number;
  weight_profile: string;
  processing_ms: number | null;
  score_breakdown: unknown;
  recommendations: unknown;
  resume_version_id: string;
  job_descriptions: { id: string; title: string; company_name: string | null; structured_data: unknown } | null;
  resume_versions: {
    id: string;
    version_number: number;
    label: string | null;
    extraction_method: string | null;
    raw_text_length: number | null;
    ats_metrics: unknown;
    resumes: { id: string; filename: string } | null;
  } | null;
}

/**
 * GET /api/analyses/[id]
 *
 * Ownership is enforced with `.eq('user_id', user.id)`; a resource belonging to
 * someone else returns 404 rather than 403 so IDs cannot be enumerated.
 */
export const GET = createRoute<{ id: string }>({ rateLimit: 'read' }, async ({ params, user, supabase }) => {
  const { id } = paramsSchema.parse(params);

  const { data, error } = await supabase
    .from('analyses')
    .select(
      'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, processing_ms, score_breakdown, recommendations, resume_version_id, job_descriptions(id, title, company_name, structured_data), resume_versions(id, version_number, label, extraction_method, raw_text_length, ats_metrics, resumes(id, filename))',
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<AnalysisQueryRow>();

  if (error) throw error;
  if (!data) throw notFound('Analysis not found');

  const { data: skills } = await supabase
    .from('extracted_skills')
    .select('id, skill_name, match_category, cosine_similarity, evidence_found')
    .eq('analysis_id', data.id)
    .order('skill_name', { ascending: true });

  const breakdown = (data.score_breakdown ?? {}) as { timings?: unknown; safety?: unknown };

  return NextResponse.json({
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
      timings: breakdown.timings ?? null,
      safety: breakdown.safety ?? null,
    },
    resume: data.resume_versions
      ? {
          version_id: data.resume_versions.id,
          version_number: data.resume_versions.version_number,
          label: data.resume_versions.label,
          filename: data.resume_versions.resumes?.filename ?? '',
          extraction_method: data.resume_versions.extraction_method,
          raw_text_length: data.resume_versions.raw_text_length,
          ats_metrics: data.resume_versions.ats_metrics,
        }
      : null,
    job_description: data.job_descriptions ?? null,
    extracted_skills: skills ?? [],
  });
});
