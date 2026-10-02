import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createRoute } from '@/lib/utils/route-helpers';
import { notFound, logSafe } from '@/lib/utils/errors';
import { getStorageBucket } from '@/lib/env';
import { isAdminContext } from '@/lib/db/server';
import { logAdminAction } from '@/lib/services/audit';
import type { DownloadResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

const paramsSchema = z.object({ id: z.string().uuid('Invalid resume id') });
const SIGNED_URL_TTL_SECONDS = 60;

/**
 * GET /api/resumes/[id]/download
 *
 * Returns a 60-second presigned URL for the private bucket object. Owners use their
 * own session scoped by RLS; administrators may access any resume, and every such
 * access is written to `admin_audit_logs` as RESUME_ACCESS.
 */
export const GET = createRoute<{ id: string }>(
  { rateLimit: 'read' },
  async ({ params, user, supabase, ip }) => {
    const { id } = paramsSchema.parse(params);
    const admin = isAdminContext({ supabase, user, profile: null });

    let query = supabase
      .from('resumes')
      .select('id, user_id, filename, storage_key, deleted_at')
      .eq('id', id);

    // Owners are constrained by user_id; admins are not (but are still audited).
    if (!admin) query = query.eq('user_id', user.id);

    const { data: resume, error } = await query.maybeSingle<{
      id: string;
      user_id: string;
      filename: string;
      storage_key: string;
      deleted_at: string | null;
    }>();

    if (error) throw error;
    if (!resume || resume.deleted_at) throw notFound('Resume not found');

    const bucket = getStorageBucket();
    const { data: signed, error: signError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(resume.storage_key, SIGNED_URL_TTL_SECONDS, { download: resume.filename });

    if (signError || !signed?.signedUrl) {
      logSafe('Signed URL creation failed', { error: signError?.message });
      throw new Error('Could not create a download link');
    }

    if (admin && resume.user_id !== user.id) {
      await logAdminAction({
        adminUserId: user.id,
        action: 'RESUME_ACCESS',
        resourceType: 'resume',
        resourceId: resume.id,
        statusCode: 200,
        ipAddress: ip,
        metadata: { filename: resume.filename, owner_id: resume.user_id, ttl_seconds: SIGNED_URL_TTL_SECONDS },
      });
    }

    const body: DownloadResponse = {
      url: signed.signedUrl,
      expires_in: SIGNED_URL_TTL_SECONDS,
      filename: resume.filename,
    };

    return NextResponse.json(body);
  },
);
