import { NextResponse } from 'next/server';

import { createRoute, parseSearchParams } from '@/lib/utils/route-helpers';
import { paginationSchema } from '@/lib/utils/validation';
import { listAdminUsers } from '@/lib/services/admin';
import { logAdminAction } from '@/lib/services/audit';
import type { AdminUsersResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/admin/users?page=&page_size=&search=
 *
 * Admin-only. Emails are always returned masked (`jo***@gmail.com`) and the read is
 * recorded in the audit log as USER_ACCOUNT_READ.
 */
export const GET = createRoute({ rateLimit: 'admin', admin: true }, async ({ request, user, ip }) => {
  const { page, page_size: pageSize, search } = parseSearchParams(
    new URL(request.url).searchParams,
    paginationSchema,
  );

  const result = await listAdminUsers({ page, pageSize, search: search ?? null });

  await logAdminAction({
    adminUserId: user.id,
    action: 'USER_ACCOUNT_READ',
    resourceType: 'user_account_list',
    statusCode: 200,
    ipAddress: ip,
    metadata: {
      page,
      page_size: pageSize,
      search_applied: Boolean(search),
      returned: result.users.length,
    },
  });

  const body: AdminUsersResponse = {
    users: result.users,
    page: result.page,
    page_size: result.pageSize,
    total: result.total,
    total_pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
  };

  return NextResponse.json(body);
});
