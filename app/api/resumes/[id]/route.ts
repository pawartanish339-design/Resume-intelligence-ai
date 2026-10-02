import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createRoute } from '@/lib/utils/route-helpers';
import { notFound, logSafe } from '@/lib/utils/errors';
import { getStorageBucket } from '@/lib/env';
import { recordAnalyticsEvent } from '@/lib/services/audit';
import type { DeleteResumeResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

const paramsSchema = z.object({ id: z.string().uuid('Invalid resume id') });

interface VersionRow {
  id: string;
  ats_metrics: { storage_key?: string } | null;
}

/**
 * DELETE /api/resumes/[id]
 *
 * Ownership is enforced with BOTH the resource id and `user_id`; a miss returns 404
 * (never 403) so the API does not confirm the existence of other users' resources.
 * Storage objects are removed first, then the row (versions and analyses cascade).
 */
export const DELETE = createRoute<{ id: string }>(
  { rateLimit: 'mutate' },
  async ({ params, user, supabase }) => {
    const { id } = paramsSchema.parse(params);

    const { data: resume, error } = await supabase
      .from('resumes')
      .select('id, user_id, storage_key, filename, resume_versions(id, ats_metrics)')
      .eq('id', id)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle<{
        id: string;
        user_id: string;
        storage_key: string;
        filename: string;
        resume_versions: VersionRow[] | null;
      }>();

    if (error) throw error;
    if (!resume) throw notFound('Resume not found in your account');

    const keys = new Set<string>([resume.storage_key]);
    for (const version of resume.resume_versions ?? []) {
      const key = version.ats_metrics?.storage_key;
      if (key) keys.add(key);
    }

    const bucket = getStorageBucket();
    const { data: removed, error: storageError } = await supabase.storage
      .from(bucket)
      .remove(Array.from(keys));

    if (storageError) {
      // Storage is a hard dependency here: deleting the row first would orphan files.
      logSafe('Storage deletion failed; aborting resume delete', { error: storageError.message });
      throw new Error('Storage deletion failed');
    }

    const { error: deleteError } = await supabase
      .from('resumes')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) throw deleteError;

    await recordAnalyticsEvent({
      eventType: 'resume_deleted',
      userId: user.id,
      metadata: {
        deleted_objects: removed?.length ?? 0,
        versions: resume.resume_versions?.length ?? 0,
      },
    });

    const body: DeleteResumeResponse = {
      success: true,
      deleted_id: id,
      deleted_objects: removed?.length ?? 0,
    };

    return NextResponse.json(body);
  },
);
