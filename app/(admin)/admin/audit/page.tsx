import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { clientIpFromHeaders, logAdminAction, queryAuditLog } from '@/lib/services/audit';
import { maskId } from '@/lib/utils/mask';
import { AuditTable } from '@/components/admin/audit-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AdminAuditEntry, AdminAuditResponse } from '@/types/api';

export const metadata: Metadata = {
  title: 'Admin · audit log',
  description: 'Append-only record of administrative actions.',
};

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams?: { page?: string; action?: string; from?: string; to?: string };
}) {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/admin/audit');
  if (!isAdminContext(context)) redirect('/403?reason=forbidden');

  const parsedPage = Number.parseInt(searchParams?.page ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const action = typeof searchParams?.action === 'string' && searchParams.action.length > 0 ? searchParams.action : null;
  const from = typeof searchParams?.from === 'string' && searchParams.from.length > 0 ? `${searchParams.from}T00:00:00.000Z` : null;
  const to = typeof searchParams?.to === 'string' && searchParams.to.length > 0 ? `${searchParams.to}T23:59:59.999Z` : null;

  const result = await queryAuditLog({ page, pageSize: 25, action, from, to });

  await logAdminAction({
    adminUserId: context.user.id,
    action: 'AUDIT_LOG_READ',
    resourceType: 'admin_audit_logs',
    statusCode: 200,
    ipAddress: clientIpFromHeaders(headers()),
    metadata: { surface: 'admin_page', page, filtered: Boolean(action || from || to) },
  });

  const data: AdminAuditResponse = {
    page,
    page_size: 25,
    total: result.total,
    entries: result.entries.map((entry): AdminAuditEntry => ({
      id: entry.id,
      action: entry.action,
      resource_type: entry.resource_type,
      resource_id: entry.resource_id ?? null,
      status_code: entry.status_code,
      ip_address: entry.ip_address ?? null,
      metadata: (entry.metadata ?? {}) as Record<string, unknown>,
      created_at: entry.created_at,
      // Raw UUIDs add nothing to the table and are personal identifiers, so they are
      // masked the same way the API route masks them.
      admin_user_id: maskId(entry.admin_user_id),
    })),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit log</CardTitle>
        <CardDescription>
          Append-only: a database trigger rejects UPDATE and DELETE. IP addresses are stored masked, and
          admin identifiers are shown as masked labels rather than raw UUIDs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuditTable data={data} />
      </CardContent>
    </Card>
  );
}
