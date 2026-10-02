import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getServerEnv } from '@/lib/env';
import { registerSchema } from '@/lib/utils/validation';
import { AppError, jsonError, logSafe } from '@/lib/utils/errors';
import { assertSameOrigin, getClientIp } from '@/lib/utils/same-origin';
import { enforceRateLimit, buildRateLimitKey } from '@/lib/utils/rate-limit';
import { assertServerEnvConfigured } from '@/lib/utils/route-helpers';
import { recordAnalyticsEvent } from '@/lib/services/audit';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * POST /api/auth/register
 *
 * Server-side registration so that: the password policy is enforced on the server
 * (email + password + uppercase + number + special, >= 8 chars), the attempt is
 * rate limited (5/min per IP+email), and account creation is recorded as an
 * analytics event. Supabase keeps ownership of hashing and email verification.
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

    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('Registration validation failed', {
        status: 400,
        code: 'BAD_REQUEST',
        userMessage: parsed.error.issues[0]?.message ?? 'Please check the form and try again.',
      });
    }

    const { email, password } = parsed.data;

    assertServerEnvConfigured();

    await enforceRateLimit(
      'auth',
      buildRateLimitKey({ request, email, extra: getClientIp(request) ?? undefined }),
    );

    const env = getServerEnv();
    const cookieStore = cookies();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => cookieStore.set({ name, value, ...options }),
        remove: (name: string, options: CookieOptions) =>
          cookieStore.set({ name, value: '', ...options, maxAge: 0 }),
      },
    });

    const redirectTo = `${env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')}/api/auth/callback`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      // Generic message: never reveal whether an address is already registered.
      const alreadyRegistered = /already registered|already exists/i.test(error.message);
      logSafe('Registration failed', { reason: error.message });

      if (alreadyRegistered) {
        // Return success-shaped guidance without confirming account existence.
        return NextResponse.json({
          ok: true,
          requiresEmailConfirmation: true,
          message:
            'If this email is not already registered, you will receive a confirmation link shortly. Otherwise, sign in or reset your password.',
        });
      }

      throw new AppError('Registration failed', {
        status: 400,
        code: 'BAD_REQUEST',
        userMessage: error.message.replace(/^AuthApiError:\s*/i, '').slice(0, 200),
      });
    }

    await recordAnalyticsEvent({
      eventType: 'user_registered',
      userId: data.user?.id ?? null,
      metadata: {
        requires_confirmation: !data.session,
        has_session: Boolean(data.session),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        requiresEmailConfirmation: !data.session,
        message: data.session
          ? 'Account created. Redirecting to your dashboard…'
          : 'Account created. Check your email for the confirmation link, then sign in.',
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
