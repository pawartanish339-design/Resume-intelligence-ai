import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { listAdminUsers } from '@/lib/services/admin';
import { clientIpFromHeaders, logAdminAction } from '@/lib/services/audit';
import { UsersTable } from '@/components/admin/users-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminUsersResponse } from '@/types/api';

export const metadata: Metadata = {
  title: 'Admin · users',
  description: 'Search accounts, review usage counts, and suspend or reactivate access.',
};

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: { page?: string; q?: string };
}) {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/admin/users');
  if (!isAdminContext(context)) redirect('/403?reason=forbidden');

  const parsedPage = Number.parseInt(searchParams?.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const search = typeof searchParams?.q === 'string' && searchParams.q.trim().length > 0 ? searchParams.q.trim() : null;

  const result = await listAdminUsers({ page, pageSize: 20, search });

  await logAdminAction({
    adminUserId: context.user.id,
    action: 'USER_ACCOUNT_READ',
    resourceType: 'profiles',
    statusCode: 200,
    ipAddress: clientIpFromHeaders(headers()),
    metadata: { surface: 'admin_page', page, searched: Boolean(search) },
  });

  const data: AdminUsersResponse = {
    users: result.users,
    page: result.page,
    page_size: result.pageSize,
    total: result.total,
    total_pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
          <CardDescription>
            Suspension is reversible and never deletes data. Deletion is only available to the account
            owner from Settings, so an admin cannot destroy user data from this console.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UsersTable data={data} />
        </CardContent>
      </Card>
    </div>
  );
}
