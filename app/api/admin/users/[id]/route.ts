import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createRoute, parseJsonBody } from '@/lib/utils/route-helpers';
import { adminUserPatchSchema } from '@/lib/utils/validation';
import { updateUserStatus } from '@/lib/services/admin';
import { logAdminAction } from '@/lib/services/audit';
import { conflict, notFound } from '@/lib/utils/errors';
import { createAdminSupabaseClient } from '@/lib/db/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const paramsSchema = z.object({ id: z.string().uuid('Invalid user id') });

/**
 * PATCH /api/admin/users/[id]
 * Suspend or reactivate an account. Self-suspension is refused (it would lock the
 * last administrator out of the console), and every change is audit-logged.
 */
export const PATCH = createRoute<{ id: string }>(
  { rateLimit: 'admin', admin: true },
  async ({ request, params, user, ip }) => {
    const { id } = paramsSchema.parse(params);
    const body = await parseJsonBody(request, adminUserPatchSchema);

    if (id === user.id) {
      throw conflict(
        'Administrators cannot change their own status',
        'You cannot suspend your own administrator account. Ask another administrator to do it.',
      );
    }

    const admin = createAdminSupabaseClient();
    const { data: target, error } = await admin
      .from('profiles')
      .select('id, email, status')
      .eq('id', id)
      .maybeSingle<{ id: string; email: string | null; status: 'active' | 'suspended' }>();

    if (error) throw error;
    if (!target) throw notFound('User account not found');

    const updated = await updateUserStatus(id, body.status);

    await logAdminAction({
      adminUserId: user.id,
      action: 'USER_STATUS_CHANGE',
      resourceType: 'user_account',
      resourceId: id,
      statusCode: 200,
      ipAddress: ip,
      metadata: {
        previous_status: target.status,
        new_status: body.status,
        reason: body.reason ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id,
        status: updated?.status ?? body.status,
      },
    });
  },
);
