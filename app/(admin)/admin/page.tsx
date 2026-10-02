import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSessionContext, isAdminContext } from '@/lib/db/server';
import { getAdminMetrics } from '@/lib/services/admin';
import { clientIpFromHeaders, logAdminAction } from '@/lib/services/audit';
import { MetricsDashboard } from '@/components/admin/metrics-dashboard';

export const metadata: Metadata = {
  title: 'Admin overview',
  description: 'Platform metrics for the resume analysis engine.',
};

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const context = await getSessionContext();
  if (!context) redirect('/login?next=/admin');
  if (!isAdminContext(context)) redirect('/403?reason=forbidden');

  const metrics = await getAdminMetrics();

  await logAdminAction({
    adminUserId: context.user.id,
    action: 'METRICS_READ',
    resourceType: 'metrics',
    statusCode: 200,
    ipAddress: clientIpFromHeaders(headers()),
    metadata: { surface: 'admin_page' },
  });

  return <MetricsDashboard metrics={metrics} />;
}
