import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/env';

/**
 * Service-role Supabase client.
 *
 * SECURITY: this client bypasses Row Level Security. It is imported with
 * `server-only`, which makes the build fail if any client component (or anything
 * reachable from one) imports it, and it must never be used to service a request
 * without an explicit authorisation check performed by the caller.
 *
 * Legitimate uses in this codebase:
 *   - admin audit-log inserts (append-only table, no client write path)
 *   - admin user administration (list/suspend) after `requireAdminSession()`
 *   - account deletion (`auth.admin.deleteUser`) after re-authentication
 *   - analytics events that must be written with `user_id = NULL` (anonymised)
 *   - storage object listing for export/deletion flows
 */

let serviceClient: SupabaseClient | null = null;

export function createAdminSupabaseClient(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const env = getServerEnv();
  serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return serviceClient;
}

/** Admin-side user lookup used by the "promote to admin" script and admin APIs. */
export async function findUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminSupabaseClient();
  const normalized = email.trim().toLowerCase();

  // The Admin API has no "get by email" endpoint; page through and match exactly.
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
    if (match) return match;

    if (data.users.length < 200) return null;
  }

  return null;
}

/**
 * Promote or demote a user. `app_metadata` is only writable with the service role,
 * which is what makes `public.is_admin()` trustworthy inside RLS policies.
 */
export async function setUserRole(userId: string, role: 'admin' | 'user'): Promise<User> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });

  if (error) throw error;
  return data.user;
}

export async function setUserStatus(userId: string, status: 'active' | 'suspended'): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('profiles').update({ status }).eq('id', userId);
  if (error) throw error;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.auth.admin.deleteUser(userId, false);
  if (error) throw error;
}

/** Storage helpers that need to bypass the per-user object policies. */
export async function listUserStorageObjects(userId: string): Promise<string[]> {
  const admin = createAdminSupabaseClient();
  const env = getServerEnv();

  const { data, error } = await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).list(userId, {
    limit: 1_000,
  });
  if (error) throw error;

  return (data ?? []).map((object) => `${userId}/${object.name}`);
}

export async function removeStorageObjects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const admin = createAdminSupabaseClient();
  const env = getServerEnv();

  const { data, error } = await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove(keys);
  if (error) throw error;

  return (data ?? []).length;
}

/** Health probe: a real, cheap round trip against a tiny table. */
export async function probeDatabase(): Promise<{ status: 'up' | 'down'; latency_ms: number; detail?: string }> {
  const startedAt = Date.now();
  try {
    const admin = createAdminSupabaseClient();
    const { error } = await admin.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      return { status: 'down', latency_ms: Date.now() - startedAt, detail: error.message };
    }
    return { status: 'up', latency_ms: Date.now() - startedAt };
  } catch (error) {
    return {
      status: 'down',
      latency_ms: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}

export async function probeStorage(): Promise<{ status: 'up' | 'down'; latency_ms: number; detail?: string }> {
  const startedAt = Date.now();
  try {
    const admin = createAdminSupabaseClient();
    const env = getServerEnv();
    const { error } = await admin.storage.from(env.SUPABASE_STORAGE_BUCKET).list('', { limit: 1 });
    if (error) {
      return { status: 'down', latency_ms: Date.now() - startedAt, detail: error.message };
    }
    return { status: 'up', latency_ms: Date.now() - startedAt, detail: `bucket "${env.SUPABASE_STORAGE_BUCKET}" reachable` };
  } catch (error) {
    return {
      status: 'down',
      latency_ms: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}
