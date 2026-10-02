import 'server-only';

import { createAdminSupabaseClient } from '@/lib/db/admin';
import { maskEmail } from '@/lib/utils/mask';
import type { AdminUserSummary } from '@/types/api';
import type { AdminMetricsResponse } from '@/types/api';

/**
 * Admin data services.
 *
 * These deliberately use the service-role client: the admin console needs aggregate
 * counts that RLS would otherwise hide, and it must read accounts other than the
 * caller's own. Every function here is only reachable from a route handler or page
 * that already verified the `app_metadata.role === 'admin'` claim, and each call site
 * writes an audit row.
 */

export interface ListUsersInput {
  page?: number;
  pageSize?: number;
  /**
   * Exact email match. Wildcards are stripped by the caller's Zod schema, so an
   * admin cannot enumerate accounts with a partial string.
   */
  search?: string | null;
}

interface ProfileRow {
  id: string;
  email: string | null;
  status: string;
  created_at: string;
}

function countByUser(rows: Array<{ user_id: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  return counts;
}

export async function listAdminUsers(input: ListUsersInput = {}): Promise<{
  users: AdminUserSummary[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(5, input.pageSize ?? 20));
  const from = (page - 1) * pageSize;

  const admin = createAdminSupabaseClient();
  let request = admin
    .from('profiles')
    .select('id, email, status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + pageSize - 1);

  if (input.search) {
    request = request.eq('email', input.search.trim().toLowerCase());
  }

  const { data, error, count } = await request;
  if (error) throw error;

  const profiles = (data ?? []) as ProfileRow[];
  const ids = profiles.map((profile) => profile.id);

  const [{ data: resumeRows }, { data: analysisRows }] = await Promise.all([
    ids.length > 0
      ? admin.from('resumes').select('user_id').in('user_id', ids).is('deleted_at', null).limit(5_000)
      : Promise.resolve({ data: [] as Array<{ user_id: string }> }),
    ids.length > 0
      ? admin.from('analyses').select('user_id, created_at').in('user_id', ids).limit(5_000)
      : Promise.resolve({ data: [] as Array<{ user_id: string; created_at: string }> }),
  ]);

  const resumeCounts = countByUser((resumeRows ?? []) as Array<{ user_id: string }>);
  const analysisCounts = countByUser((analysisRows ?? []) as Array<{ user_id: string }>);

  const lastActivity = new Map<string, string>();
  for (const row of (analysisRows ?? []) as Array<{ user_id: string; created_at: string }>) {
    const current = lastActivity.get(row.user_id);
    if (!current || new Date(row.created_at) > new Date(current)) {
      lastActivity.set(row.user_id, row.created_at);
    }
  }

  const users: AdminUserSummary[] = profiles.map((profile) => ({
    id: profile.id,
    // Emails never leave the service layer unmasked.
    email_masked: maskEmail(profile.email),
    status: profile.status === 'suspended' ? 'suspended' : 'active',
    created_at: profile.created_at,
    resume_count: resumeCounts.get(profile.id) ?? 0,
    analysis_count: analysisCounts.get(profile.id) ?? 0,
    last_activity_at: lastActivity.get(profile.id) ?? null,
  }));

  return { users, total: count ?? users.length, page, pageSize };
}

export async function updateUserStatus(
  userId: string,
  status: 'active' | 'suspended',
): Promise<ProfileRow | null> {
  const admin = createAdminSupabaseClient();

  const { data, error } = await admin
    .from('profiles')
    .update({ status })
    .eq('id', userId)
    .select('id, email, status, created_at')
    .maybeSingle<ProfileRow>();

  if (error) throw error;
  return data ?? null;
}

interface DailyRow {
  day: string;
  registrations: number;
  uploads: number;
  analyses_count: number;
}

interface ProfileScoreRow {
  weight_profile: string;
  analysis_count: number;
  avg_overall_score: number | null;
  avg_job_match_score: number | null;
  avg_ats_score: number | null;
  avg_processing_ms: number | null;
}

interface FailureRow {
  event_type: string;
  day: string;
  event_count: number;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Platform metrics.
 *
 * Aggregates come from the admin views defined in the migration (they run with
 * `security_invoker = true`, so the service role is still required to read them).
 */
export async function getAdminMetrics(): Promise<AdminMetricsResponse> {
  const admin = createAdminSupabaseClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();

  const [
    profilesTotal,
    profilesSuspended,
    resumesTotal,
    analysesTotal,
    dailyRes,
    profileRes,
    failureRes,
    activityRes,
    llmRes,
  ] = await Promise.all([
      admin.from('profiles').select('id', { head: true, count: 'exact' }),
      admin.from('profiles').select('id', { head: true, count: 'exact' }).eq('status', 'suspended'),
      admin.from('resumes').select('id', { head: true, count: 'exact' }).is('deleted_at', null),
      admin.from('analyses').select('id', { head: true, count: 'exact' }),
      admin.from('admin_daily_metrics').select('day, registrations, uploads, analyses_count').gte('day', since30.slice(0, 10)).order('day', { ascending: true }),
      admin.from('admin_avg_scores').select('*').limit(20),
      admin.from('admin_failure_counts').select('event_type, day, event_count').order('day', { ascending: false }).limit(50),
      admin
        .from('analytics_events')
        .select('event_type, user_id, created_at')
        .in('event_type', ['user_registered', 'user_login', 'analysis_created', 'resume_uploaded'])
        .gte('created_at', since30)
        .limit(20_000),
      admin
        .from('analytics_events')
        .select('event_type, metadata, created_at')
        .in('event_type', ['llm_call', 'llm_call_failed'])
        .gte('created_at', since30)
        .limit(20_000),
    ]);

  const activityRows = (activityRes.data ?? []) as Array<{ event_type: string; user_id: string | null; created_at: string }>;
  const now = Date.now();
  const activeWithin = (days: number) => {
    const threshold = now - days * 24 * 60 * 60 * 1_000;
    const users = new Set<string>();
    for (const row of activityRows) {
      if (!row.user_id) continue;
      if (new Date(row.created_at).getTime() >= threshold) users.add(row.user_id);
    }
    return users.size;
  };

  const llmRows = (llmRes.data ?? []) as Array<{ event_type: string; metadata: Record<string, unknown> | null }>;
  const llmSuccess = llmRows.filter((row) => row.event_type === 'llm_call');
  const llmFailed = llmRows.filter((row) => row.event_type === 'llm_call_failed');

  const tokens = llmSuccess.reduce((total, row) => {
    const value = numeric(row.metadata?.total_tokens);
    return total + (value ?? 0);
  }, 0);

  const latencies = llmSuccess
    .map((row) => numeric(row.metadata?.duration_ms))
    .filter((value): value is number => value !== null);

  const daily = ((dailyRes.data ?? []) as DailyRow[]).map((row) => ({
    day: row.day,
    registrations: Number(row.registrations ?? 0),
    uploads: Number(row.uploads ?? 0),
    analyses_count: Number(row.analyses_count ?? 0),
  }));

  const byProfile = ((profileRes.data ?? []) as ProfileScoreRow[]).map((row) => ({
    weight_profile: row.weight_profile,
    analysis_count: Number(row.analysis_count ?? 0),
    avg_overall_score: numeric(row.avg_overall_score),
    avg_ats_score: numeric(row.avg_ats_score),
  }));

  const failures = ((failureRes.data ?? []) as FailureRow[]).map((row) => ({
    event_type: row.event_type,
    day: row.day,
    event_count: Number(row.event_count ?? 0),
  }));

  const rawProfileRows = (profileRes.data ?? []) as ProfileScoreRow[];
  const profileAnalyses = rawProfileRows.reduce((total, row) => total + Number(row.analysis_count ?? 0), 0);

  /** Analysis-count weighted mean across profiles (avoids averaging averages). */
  const weightedAvg = (pick: (row: ProfileScoreRow) => number | null): number | null => {
    if (profileAnalyses === 0) return null;
    const total = rawProfileRows.reduce(
      (sum, row) => sum + (pick(row) ?? 0) * Number(row.analysis_count ?? 0),
      0,
    );
    return Math.round((total / profileAnalyses) * 100) / 100;
  };

  const llmLatencies = latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null;
  const llmCalls = llmSuccess.length + llmFailed.length;

  return {
    totals: {
      users: profilesTotal.count ?? 0,
      users_active_24h: activeWithin(1),
      users_active_7d: activeWithin(7),
      users_active_30d: activeWithin(30),
      suspended_users: profilesSuspended.count ?? 0,
      resumes: resumesTotal.count ?? 0,
      analyses: analysesTotal.count ?? 0,
      avg_overall_score: weightedAvg((row) => row.avg_overall_score),
      avg_job_match_score: weightedAvg((row) => row.avg_job_match_score),
      avg_ats_score: weightedAvg((row) => row.avg_ats_score),
      avg_processing_ms: (() => {
        const value = weightedAvg((row) => row.avg_processing_ms);
        return value === null ? null : Math.round(value);
      })(),
    },
    daily,
    by_profile: byProfile,
    failures,
    llm: {
      calls_30d: llmCalls,
      tokens_30d: tokens,
      avg_latency_ms: llmLatencies === null ? null : Math.round(llmLatencies),
      error_rate: llmCalls > 0 ? Math.round((llmFailed.length / llmCalls) * 10_000) / 10_000 : null,
    },
  };
}

/**
 * Storage objects are not covered by RLS policies for the service role, so the
 * account-deletion flow lists them explicitly. Keys are namespaced as
 * `{userId}/{resumeId}/{filename}` by the upload route.
 */
export async function listStorageObjectsForUser(userId: string): Promise<string[]> {
  const admin = createAdminSupabaseClient();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'resumes';

  // Upload keys are `{userId}/{resumeId}/{filename}`, so the first listing returns
  // resume folders and each folder must be listed again to reach the objects.
  const { data: folders, error } = await admin.storage.from(bucket).list(userId, { limit: 1_000 });
  if (error) return [];

  const keys: string[] = [];
  for (const folder of folders ?? []) {
    const { data: objects } = await admin.storage.from(bucket).list(`${userId}/${folder.name}`, { limit: 1_000 });
    for (const object of objects ?? []) keys.push(`${userId}/${folder.name}/${object.name}`);
  }

  return keys;
}
