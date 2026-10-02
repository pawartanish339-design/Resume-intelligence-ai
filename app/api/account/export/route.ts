import { NextResponse } from 'next/server';

import { createRoute } from '@/lib/utils/route-helpers';
import { exportAccountData } from '@/lib/services/account';
import { recordAnalyticsEvent } from '@/lib/services/audit';
import type { AccountExportResponse } from '@/types/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * GET /api/account/export
 * Full JSON export of the caller's data (profile, resumes + versions, analyses,
 * analytics events). Content-Disposition makes it a download in the browser.
 */
export const GET = createRoute({ rateLimit: 'read' }, async ({ user }) => {
  const payload = await exportAccountData(user);

  await recordAnalyticsEvent({
    eventType: 'account_export',
    userId: user.id,
    metadata: {
      resumes: payload.resumes.length,
      analyses: payload.analyses.length,
    },
  });

  const response: AccountExportResponse = payload;

  return new NextResponse(JSON.stringify(response, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="resume-analyzer-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
});
