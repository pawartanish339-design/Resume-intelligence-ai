import { NextResponse } from 'next/server';

import { createRoute } from '@/lib/utils/route-helpers';
import { getAdminMetrics } from '@/lib/services/admin';
import { logAdminAction } from '@/lib/services/audit';
import type { AdminMetricsResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** GET /api/admin/metrics -- aggregated telemetry from the SQL views + analytics. */
export const GET = createRoute({ rateLimit: 'admin', admin: true }, async ({ user, ip }) => {
  const metrics = await getAdminMetrics();

  await logAdminAction({
    adminUserId: user.id,
    action: 'METRICS_READ',
    resourceType: 'admin_metrics',
    statusCode: 200,
    ipAddress: ip,
    metadata: { users: metrics.totals.users, analyses: metrics.totals.analyses },
  });

  const body: AdminMetricsResponse = metrics;
  return NextResponse.json(body);
});
