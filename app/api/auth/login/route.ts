import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getServerEnv } from '@/lib/env';
import { loginSchema } from '@/lib/utils/validation';
import { AppError, jsonError, logSafe } from '@/lib/utils/errors';
import { assertSameOrigin, getClientIp } from '@/lib/utils/same-origin';
import { enforceRateLimit, buildRateLimitKey } from '@/lib/utils/rate-limit';
import { assertServerEnvConfigured } from '@/lib/utils/route-helpers';
import { isAdminUser } from '@/lib/db/server';
import { logAdminAction } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/auth/login
 *
 * Password sign-in through @supabase/ssr so the session cookies are written by the
 * server. Rate limited to 5 attempts/min per IP+email. Failed attempts always return
 * the same generic message (no account enumeration), and administrator sign-ins are
 * recorded in the audit log as ADMIN_LOGIN.
 */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError('Malformed JSON', { status: 400, code: 'BAD_REQUEST', userMessage: 'Invalid request body.' });
    }

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('Login validation failed', {
        status: 400,
        code: 'BAD_REQUEST',
        userMessage: parsed.error.issues[0]?.message ?? 'Enter your email and password.',
      });
    }

    const { email, password } = parsed.data;

    assertServerEnvConfigured();

    await enforceRateLimit('auth', buildRateLimitKey({ request, email, extra: getClientIp(request) ?? undefined }));

    const env = getServerEnv();
    const cookieStore = cookies();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: { [key: string]: unknown }) =>
          cookieStore.set({ name, value, ...(options as object) }),
        remove: (name: string, options: { [key: string]: unknown }) =>
          cookieStore.set({ name, value: '', ...(options as object), maxAge: 0 }),
      },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      logSafe('Login failed', { reason: error?.message ?? 'unknown' });
      // Deliberately generic: never disclose whether the email exists.
      return NextResponse.json(
        { error: 'Incorrect email or password.', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }

    if (isAdminUser(data.user)) {
      await logAdminAction({
        adminUserId: data.user.id,
        action: 'ADMIN_LOGIN',
        resourceType: 'session',
        resourceId: null,
        statusCode: 200,
        ipAddress: getClientIp(request),
        metadata: { method: 'password' },
      });
    }

    return NextResponse.json({
      ok: true,
      redirectTo: isAdminUser(data.user) ? '/admin' : '/dashboard',
      requiresMfa: false,
    });
  } catch (error) {
    return jsonError(error);
  }
}
