import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createRoute, parseSearchParams } from '@/lib/utils/route-helpers';
import { queryAuditLog } from '@/lib/services/audit';
import { logAdminAction } from '@/lib/services/audit';
import type { AdminAuditResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000).default(1),
  page_size: z.coerce.number().int().min(10).max(100).default(25),
  action: z.string().trim().max(128).optional().nullable(),
  admin_user_id: z.string().uuid().optional().nullable(),
  from: z.string().datetime().optional().nullable(),
  to: z.string().datetime().optional().nullable(),
});

/**
 * GET /api/admin/audit
 * Read-only, filterable view of the append-only audit log. IP addresses are masked
 * before they leave the server.
 */
export const GET = createRoute({ rateLimit: 'admin', admin: true }, async ({ request, user, ip }) => {
  const parsed = parseSearchParams(new URL(request.url).searchParams, querySchema);

  const { entries, total } = await queryAuditLog({
    page: parsed.page,
    pageSize: parsed.page_size,
    action: parsed.action ?? null,
    adminUserId: parsed.admin_user_id ?? null,
    from: parsed.from ?? null,
    to: parsed.to ?? null,
  });

  await logAdminAction({
    adminUserId: user.id,
    action: 'AUDIT_LOG_READ',
    resourceType: 'admin_audit_logs',
    statusCode: 200,
    ipAddress: ip,
    metadata: {
      page: parsed.page,
      filters: {
        action: parsed.action ?? null,
        admin_user_id: parsed.admin_user_id ?? null,
        from: parsed.from ?? null,
        to: parsed.to ?? null,
      },
      returned: entries.length,
    },
  });

  const body: AdminAuditResponse = {
    entries,
    page: parsed.page,
    page_size: parsed.page_size,
    total,
  };

  return NextResponse.json(body);
});
