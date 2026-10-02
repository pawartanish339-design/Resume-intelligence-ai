import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createAdminSupabaseClient } from '@/lib/db/admin';
import { conflict } from '@/lib/utils/errors';
import type { AccountExportResponse } from '@/types/api';
import { getStorageBucket } from '@/lib/env';
import { listStorageObjectsForUser } from '@/lib/services/admin';

/**
 * Account data lifecycle: full export (GDPR-style portability) and hard deletion.
 *
 * Both operations use the service-role client because deletion must also remove
 * storage objects and rows that RLS protects from the user's own token, and because
 * the export needs `analytics_events` rows (which have no client SELECT policy for
 * user_id = null rows). Every function here is only ever called with a session that
 * has already been verified, and the user id always comes from the server-side
 * session -- never from a request body.
 */

/** Phrase the user must type to delete an account. Exported for UI + tests. */
export const DELETION_CONFIRMATION_PHRASE = 'DELETE MY ACCOUNT';

function isAdmin(user: User): boolean {
  const metadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return metadata.role === 'admin';
}

/**
 * Admins cannot self-delete: `admin_audit_logs.admin_user_id` is ON DELETE RESTRICT,
 * because the audit trail is the accountability record for privileged actions.
 * The migration documents the anonymise/transfer procedure.
 */
export function assertDeletableAccount(user: User): void {
  if (isAdmin(user)) {
    throw conflict(
      'Admin accounts cannot be self-deleted',
      'Admin accounts are protected because they own audit-log rows. Ask another administrator to anonymise this account instead.',
    );
  }
}

export async function exportAccountData(user: User): Promise<AccountExportResponse> {
  const admin = createAdminSupabaseClient();

  const [profileResult, resumesResult, analysesResult, eventsResult] = await Promise.all([
    admin.from('profiles').select('id, email, status, created_at').eq('id', user.id).maybeSingle<{
      id: string;
      email: string | null;
      status: string;
      created_at: string;
    }>(),
    admin
      .from('resumes')
      .select(
        'id, filename, file_type, file_size_bytes, created_at, resume_versions(id, version_number, label, extraction_method, raw_text_length, created_at, extracted_data, ats_metrics)',
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('analyses')
      .select(
        'id, created_at, overall_score, job_match_score, ats_score, skill_score, weight_profile, score_breakdown, recommendations, job_descriptions(title, company_name)',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(2_000),
    admin
      .from('analytics_events')
      .select('event_type, created_at, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(5_000),
  ]);

  type ResumeExportRow = AccountExportResponse['resumes'][number];
  type VersionExportRow = ResumeExportRow['versions'][number];

  const resumeRows = (resumesResult.data ?? []) as unknown as Array<
    Omit<ResumeExportRow, 'versions'> & { resume_versions: VersionExportRow[] | null }
  >;

  const analysisRows = (analysesResult.data ?? []) as unknown as Array<
    Omit<AccountExportResponse['analyses'][number], 'job_description'> & {
      job_descriptions: { title: string; company_name: string | null } | null;
    }
  >;

  return {
    exported_at: new Date().toISOString(),
    profile: profileResult.data ?? {
      id: user.id,
      email: user.email ?? null,
      status: 'active',
      created_at: user.created_at ?? new Date().toISOString(),
    },
    resumes: resumeRows.map((resume) => ({
      id: resume.id,
      filename: resume.filename,
      file_type: resume.file_type,
      file_size_bytes: resume.file_size_bytes,
      created_at: resume.created_at,
      versions: (resume.resume_versions ?? []).map((version) => ({
        id: version.id,
        version_number: version.version_number,
        label: version.label,
        extraction_method: version.extraction_method,
        raw_text_length: version.raw_text_length,
        created_at: version.created_at,
        extracted_data: version.extracted_data,
        ats_metrics: version.ats_metrics,
      })),
    })),
    analyses: analysisRows.map((analysis) => ({
      id: analysis.id,
      created_at: analysis.created_at,
      overall_score: Number(analysis.overall_score),
      job_match_score: Number(analysis.job_match_score),
      ats_score: Number(analysis.ats_score),
      skill_score: Number(analysis.skill_score),
      weight_profile: analysis.weight_profile,
      score_breakdown: analysis.score_breakdown,
      recommendations: analysis.recommendations,
      job_description: analysis.job_descriptions
        ? { title: analysis.job_descriptions.title, company_name: analysis.job_descriptions.company_name }
        : null,
    })),
    analytics_events: (eventsResult.data ?? []).map((event) => ({
      event_type: event.event_type,
      created_at: event.created_at,
      metadata: event.metadata,
    })),
  };
}

export interface DeletionOutcome {
  storage_objects_deleted: number;
}

/**
 * Hard-delete the account.
 *
 * Order matters:
 *   1. collect storage keys while the rows still exist,
 *   2. delete the auth user (cascades through every owned table via ON DELETE CASCADE),
 *   3. remove the storage objects last, so a failed object delete cannot leave rows
 *      pointing at files that no longer exist.
 *
 * Analytics events are deliberately NOT deleted by the cascade: `user_id` is
 * `ON DELETE SET NULL`, so the events are anonymised and kept for aggregate metrics.
 * This is documented in the migration and surfaced in the deletion UI.
 */
export async function deleteAccount(user: User): Promise<DeletionOutcome> {
  assertDeletableAccount(user);

  const admin = createAdminSupabaseClient();

  const { data: storageKeys } = await admin
    .from('resumes')
    .select('storage_key')
    .eq('user_id', user.id)
    .limit(2_000);

  const keys = new Set<string>();
  for (const row of (storageKeys ?? []) as Array<{ storage_key: string | null }>) {
    if (row.storage_key) keys.add(row.storage_key);
  }

  // Version-level keys (one file per version) live inside `ats_metrics.storage_key`.
  const { data: versionRows } = await admin
    .from('resume_versions')
    .select('id, ats_metrics, resumes!inner(user_id)')
    .eq('resumes.user_id', user.id)
    .limit(2_000);

  for (const row of (versionRows ?? []) as Array<{ ats_metrics: { storage_key?: string } | null }>) {
    const key = row.ats_metrics?.storage_key;
    if (key) keys.add(key);
  }

  // Namespaced listing catches anything the row-level keys missed.
  for (const key of await listStorageObjectsForUser(user.id)) keys.add(key);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    throw new Error(`Failed to delete auth user: ${deleteError.message}`);
  }

  let deletedObjects = 0;
  if (keys.size > 0) {
    const bucket = getStorageBucket();
    const list = [...keys];

    // Storage API accepts at most 100 paths per call.
    for (let index = 0; index < list.length; index += 100) {
      const chunk = list.slice(index, index + 100);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (!error) deletedObjects += chunk.length;
    }
  }

  return { storage_objects_deleted: deletedObjects };
}
