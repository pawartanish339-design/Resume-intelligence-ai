import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getServerEnv } from '@/lib/env';
import { logSafe } from '@/lib/utils/errors';
import { recordAnalyticsEvent } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * GET /api/auth/callback?code=...&next=/dashboard
 *
 * OAuth / email-link code exchange. On success the session cookies are written and
 * the user is redirected; on failure the visitor lands on the login page with an
 * explanatory query parameter. No token ever appears in a redirect body.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const requestedNext = url.searchParams.get('next') ?? '/dashboard';

  // Only allow relative redirects: an absolute URL would be an open redirect.
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';

  const failureRedirect = (reason: string) => {
    const target = new URL('/login', url.origin);
    target.searchParams.set('error', reason);
    return NextResponse.redirect(target);
  };

  if (!code && !(tokenHash && type)) {
    return failureRedirect('missing_code');
  }

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    const env = getServerEnv();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  } catch {
    return failureRedirect('not_configured');
  }

  const cookieStore = cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });

  try {
    const { data, error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' | 'recovery' | 'invite' | 'magiclink' })
      : await supabase.auth.exchangeCodeForSession(code as string);

    if (error || !data.user) {
      logSafe('Auth callback failed', { reason: error?.message ?? 'no user' });
      return failureRedirect('auth_failed');
    }

    await recordAnalyticsEvent({
      eventType: 'auth_callback_completed',
      userId: data.user.id,
      metadata: { method: code ? 'pkce' : 'otp', type: type ?? 'pkce' },
    });

    // Password recovery must land on the reset form.
    const destination = type === 'recovery' ? '/reset-password' : next;
    return NextResponse.redirect(new URL(destination, url.origin));
  } catch (error) {
    logSafe('Auth callback threw', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return failureRedirect('auth_failed');
  }
}
