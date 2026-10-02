import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { getServerEnv, isServerEnvComplete } from '@/lib/env';
import { AppError, forbidden, unauthorized } from '@/lib/utils/errors';
import type { ProfileRow } from '@/lib/db/types';

/**
 * Server-side Supabase clients.
 *
 * Two flavours:
 *   - `createServerSupabaseClient()`  -- cookie-bound, respects RLS as the user.
 *   - `createRouteHandlerSupabaseClient()` -- same, but writes refreshed cookies
 *     onto the outgoing response (only legal inside route handlers / server actions).
 *
 * Every route handler MUST use one of these (or `getSessionContext`) and derive
 * the user id from `auth.getUser()` -- client-supplied user ids are never trusted.
 */

type CookieStore = ReturnType<typeof cookies>;

export function createServerSupabaseClient(cookieStore?: CookieStore): SupabaseClient {
  const env = getServerEnv();
  const store = cookieStore ?? cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return store.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          store.set({ name, value, ...options });
        } catch {
          // Called from a Server Component render: middleware refreshes the session.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          store.set({ name, value: '', ...options, maxAge: 0 });
        } catch {
          // See above.
        }
      },
    },
  });
}

/**
 * Route-handler client: identical, but the cookie store is mutable so Supabase
 * can rotate the session tokens during the request.
 */
export function createRouteHandlerSupabaseClient(cookieStore?: CookieStore): SupabaseClient {
  return createServerSupabaseClient(cookieStore);
}

export interface SessionContext {
  supabase: SupabaseClient;
  user: User;
  profile: ProfileRow | null;
}

/**
 * Returns null instead of throwing -- for optional-auth surfaces.
 *
 * A freshly cloned checkout has no credentials yet. In that state every page treats
 * the visitor as a guest (and redirects protected pages to sign-in, which renders its
 * "not configured" notice) rather than failing with a 500 from `getServerEnv()`.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  if (!isServerEnvComplete()) return null;

  const supabase = createServerSupabaseClient();

  // getUser() validates the JWT against Supabase Auth; never use getSession() for authz.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, status, created_at')
    .eq('id', data.user.id)
    .maybeSingle<ProfileRow>();

  return { supabase, user: data.user, profile: profile ?? null };
}

export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) throw unauthorized('No authenticated session found');
  return context;
}

/** Blocks suspended accounts on every authenticated route. */
export async function requireActiveSession(): Promise<SessionContext> {
  const context = await requireSession();

  if (context.profile?.status === 'suspended') {
    throw new AppError('Account suspended', {
      status: 403,
      code: 'SUSPENDED',
      userMessage:
        'This account has been suspended. Contact an administrator if you believe this is a mistake.',
    });
  }

  return context;
}

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>;
  return appMetadata.role === 'admin';
}

export function isAdminContext(context: SessionContext | null): boolean {
  return isAdminUser(context?.user ?? null);
}

/** Admin-only guard used by every /api/admin route. */
export async function requireAdminSession(): Promise<SessionContext> {
  const context = await requireActiveSession();
  if (!isAdminContext(context)) {
    throw forbidden('Administrator privileges are required for this resource');
  }
  return context;
}

/**
 * Page-oriented helpers.
 *
 * Server components cannot throw an API error body, so these translate the same
 * conditions into redirects: no session -> sign-in, suspended -> /403.
 */

/** Alias with an explicit name for server components and pages. */
export function createSupabaseServerClient(): SupabaseClient {
  return createServerSupabaseClient();
}

export async function getCurrentUser(supabase: SupabaseClient): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** Redirects to the sign-in page when there is no valid session. */
export async function requireUser(supabase: SupabaseClient, nextPath = '/dashboard'): Promise<User> {
  const user = await getCurrentUser(supabase);
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', user.id)
    .maybeSingle<{ status: string }>();

  if (profile?.status === 'suspended') redirect('/403?reason=suspended');

  return user;
}

/** Current site URL used for auth redirects. */
export function getSiteUrl(): string {
  const env = getServerEnv();
  return env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
}
