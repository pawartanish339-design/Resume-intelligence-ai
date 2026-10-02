import { NextResponse } from 'next/server';

import { createRoute } from '@/lib/utils/route-helpers';
import { logSafe } from '@/lib/utils/errors';
import type { ResumeListItem } from '@/types/resume';
import type { ResumeListResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface ResumeQueryRow {
  id: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  created_at: string;
  updated_at: string;
  resume_versions: Array<{
    id: string;
    version_number: number;
    label: string | null;
    raw_text_length: number | null;
    extraction_method: string | null;
    created_at: string;
    ats_metrics: { ats?: { score?: number } } | null;
  }>;
}

/**
 * GET /api/resumes
 * Lists the caller's resumes with their versions. RLS scopes the query by default;
 * the explicit `.eq('user_id', ...)` makes the ownership requirement obvious and
 * keeps the query fast on the (user_id, created_at) index.
 */
export const GET = createRoute({ rateLimit: 'read' }, async ({ user, supabase }) => {
  const { data, error } = await supabase
    .from('resumes')
    .select(
      'id, filename, file_type, file_size_bytes, created_at, updated_at, resume_versions(id, version_number, label, raw_text_length, extraction_method, created_at, ats_metrics)',
    )
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .returns<ResumeQueryRow[]>();

  if (error) throw error;

  const versionIds = (data ?? []).flatMap((resume) =>
    (resume.resume_versions ?? []).map((version) => version.id),
  );

  // One query for all analysis counts, aggregated in process.
  const analysisCounts = new Map<string, number>();
  if (versionIds.length > 0) {
    const { data: analyses, error: analysisError } = await supabase
      .from('analyses')
      .select('resume_version_id')
      .eq('user_id', user.id)
      .in('resume_version_id', versionIds)
      .limit(5_000);

    if (analysisError) {
      logSafe('Failed to load analysis counts', { error: analysisError.message });
    } else {
      for (const row of (analyses ?? []) as Array<{ resume_version_id: string }>) {
        analysisCounts.set(row.resume_version_id, (analysisCounts.get(row.resume_version_id) ?? 0) + 1);
      }
    }
  }

  const resumes: ResumeListItem[] = (data ?? []).map((resume) => ({
    id: resume.id,
    filename: resume.filename,
    file_type: resume.file_type,
    file_size_bytes: resume.file_size_bytes,
    created_at: resume.created_at,
    updated_at: resume.updated_at,
    versions: (resume.resume_versions ?? [])
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
      })),
  }));

  const body: ResumeListResponse = { resumes };
  return NextResponse.json(body);
});
