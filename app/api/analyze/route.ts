import { NextResponse } from 'next/server';

import { createRoute, parseJsonBody } from '@/lib/utils/route-helpers';
import { analyzeRequestSchema } from '@/lib/utils/validation';
import { runAnalysisPipeline, type ResumeStoredMetrics } from '@/lib/services/analysis-pipeline';
import { recordAnalyticsEvent } from '@/lib/services/audit';
import { badRequest, logSafe, errorMessage } from '@/lib/utils/errors';
import type { CanonicalResume } from '@/lib/ai/schemas';
import type { AnalyzeResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/analyze
 *
 * Body: { resume_version_id, raw_jd_text, title, company_name?, weight_profile?, mask_pii? }
 *
 * Runs the full pipeline (JD extraction -> matching -> ATS/quality/experience ->
 * deterministic scoring -> evidence-grounded recommendations) and persists the
 * analysis. The resume is not re-parsed: a stored version can be compared against
 * many job descriptions cheaply and deterministically.
 */
export const POST = createRoute({ rateLimit: 'analyze' }, async ({ request, user, supabase }) => {
  const startedAt = Date.now();
  const body = await parseJsonBody(request, analyzeRequestSchema);

  // Ownership: the version must belong to a resume owned by the caller.
  const { data: version, error: versionError } = await supabase
    .from('resume_versions')
    .select(
      'id, resume_id, version_number, extracted_data, raw_text_length, extraction_method, ats_metrics, resumes!inner(id, user_id, filename, deleted_at)',
    )
    .eq('id', body.resume_version_id)
    .eq('resumes.user_id', user.id)
    .maybeSingle<{
      id: string;
      resume_id: string;
      version_number: number;
      extracted_data: CanonicalResume;
      raw_text_length: number | null;
      extraction_method: string | null;
      ats_metrics: ResumeStoredMetrics | null;
      resumes: { id: string; user_id: string; filename: string; deleted_at: string | null };
    }>();

  if (versionError) throw versionError;
  if (!version || version.resumes?.deleted_at) {
    throw badRequest('The selected resume version could not be found in your account');
  }

  try {
    const { result } = await runAnalysisPipeline({
      userId: user.id,
      supabase,
      resumeVersion: {
        id: version.id,
        resume_id: version.resume_id,
        version_number: version.version_number,
        extracted_data: version.extracted_data,
        raw_text_length: version.raw_text_length,
        extraction_method: version.extraction_method,
        ats_metrics: version.ats_metrics,
      },
      jdText: body.raw_jd_text,
      title: body.title,
      companyName: body.company_name ?? null,
      weightProfile: body.weight_profile ?? null,
      maskPii: body.mask_pii ?? false,
      persist: true,
    });

    result.resume.filename = version.resumes?.filename ?? '';

    const response: AnalyzeResponse = result;
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logSafe('Analysis pipeline failed', {
      user_id: user.id,
      error: errorMessage(error),
    });

    await recordAnalyticsEvent({
      eventType: 'analysis_failed',
      userId: user.id,
      metadata: {
        duration_ms: Date.now() - startedAt,
        stage: 'pipeline',
        error_name: error instanceof Error ? error.name : 'unknown',
      },
    });

    throw error;
  }
});
