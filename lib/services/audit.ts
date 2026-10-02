import 'server-only';

import { createAdminSupabaseClient } from '@/lib/db/admin';
import { errorMessage, logSafe } from '@/lib/utils/errors';
import { sanitizeAnalyticsMetadata } from '@/lib/utils/pii';
import { maskIp } from '@/lib/utils/mask';
import type { AdminAuditLogRow } from '@/lib/db/types';

/**
 * Audit + analytics writers.
 *
 * Both use the service-role client because:
 *   - `admin_audit_logs` is append-only with no client write policies,
 *   - anonymised analytics events (user_id = null) must be writable after account
 *     deletion, when there is no user session left.
 *
 * Audit logging must NEVER break the caller's flow: failures are logged and
 * swallowed. Refusing a completed admin action retroactively is worse than a missing
 * log line, so the exception is surfaced to ops via logSafe instead.
 */

export type AdminActionName =
  | 'ADMIN_LOGIN'
  | 'USER_ACCOUNT_READ'
  | 'USER_STATUS_CHANGE'
  | 'RESUME_ACCESS'
  | 'SYSTEM_CONFIG_MUTATION'
  | 'AUDIT_LOG_READ'
  | 'METRICS_READ'
  | 'ACCOUNT_EXPORT'
  | 'ACCOUNT_DELETION';

export async function logAdminAction(payload: {
  adminUserId: string;
  action: AdminActionName | string;
  resourceType: string;
  resourceId?: string | null;
  statusCode: number;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('admin_audit_logs').insert({
      admin_user_id: payload.adminUserId,
      action: payload.action,
      resource_type: payload.resourceType,
      resource_id: payload.resourceId ?? null,
      status_code: payload.statusCode,
      // Stored masked: the raw address is not needed to answer "who did what".
      ip_address: payload.ipAddress ? maskIp(payload.ipAddress) : null,
      metadata: sanitizeAnalyticsMetadata(payload.metadata ?? {}),
    });

    if (error) {
      logSafe('Failed to write admin audit entry', { action: payload.action, error: error.message });
    }
  } catch (error) {
    logSafe('Admin audit insert threw', { action: payload.action, error: errorMessage(error) });
  }
}

export interface AuditQuery {
  page?: number;
  pageSize?: number;
  action?: string | null;
  adminUserId?: string | null;
  from?: string | null;
  to?: string | null;
}

export async function queryAuditLog(query: AuditQuery = {}): Promise<{
  entries: AdminAuditLogRow[];
  total: number;
}> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, query.pageSize ?? 25));
  const from = (page - 1) * pageSize;

  const admin = createAdminSupabaseClient();
  let request = admin
    .from('admin_audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (query.action) request = request.eq('action', query.action);
  if (query.adminUserId) request = request.eq('admin_user_id', query.adminUserId);
  if (query.from) request = request.gte('created_at', query.from);
  if (query.to) request = request.lte('created_at', query.to);

  const { data, error, count } = await request;
  if (error) throw error;

  return { entries: (data ?? []) as AdminAuditLogRow[], total: count ?? 0 };
}

export interface AnalyticsEventInput {
  eventType: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a non-PII analytics event. Metadata is sanitised (no emails, phone numbers,
 * document text, or names) before it reaches the table.
 */
export async function recordAnalyticsEvent(input: AnalyticsEventInput): Promise<void> {
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('analytics_events').insert({
      event_type: input.eventType,
      user_id: input.userId ?? null,
      metadata: sanitizeAnalyticsMetadata(input.metadata ?? {}),
    });

    if (error) {
      logSafe('Failed to write analytics event', { eventType: input.eventType, error: error.message });
    }
  } catch (error) {
    logSafe('Analytics insert threw', { eventType: input.eventType, error: errorMessage(error) });
  }
}

/** Convenience wrapper that adds a duration measured by the caller. */
export async function recordTimedEvent(
  eventType: string,
  userId: string | null,
  metadata: Record<string, unknown>,
  startedAt: number,
): Promise<void> {
  await recordAnalyticsEvent({
    eventType,
    userId,
    metadata: { ...metadata, duration_ms: Date.now() - startedAt },
  });
}

/**
 * Resolve the caller IP from Next.js `headers()` inside a server component.
 *
 * Server components do not receive a `Request`, so the same precedence as
 * `getClientIp(request)` is applied to the incoming header set.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const candidates = [
    headers.get('x-forwarded-for')?.split(',')[0],
    headers.get('x-real-ip'),
    headers.get('cf-connecting-ip'),
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }

  return null;
}
