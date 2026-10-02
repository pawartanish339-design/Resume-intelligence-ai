import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { getServerEnv } from '@/lib/env';
import { jsonError, logSafe } from '@/lib/utils/errors';
import { isServerEnvComplete } from '@/lib/env';
import { assertSameOrigin } from '@/lib/utils/same-origin';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** POST /api/auth/logout -- revokes the session and clears the auth cookies. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);

    // Nothing can be signed out when the deployment has no auth provider configured:
    // answer success so the client can still clear its local view.
    if (!isServerEnvComplete()) {
      return NextResponse.json({ ok: true, redirectTo: '/' });
    }

    const env = getServerEnv();
    const cookieStore = cookies();
    const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) =>
          cookieStore.set({ name, value, ...options }),
        remove: (name: string, options: CookieOptions) =>
          cookieStore.set({ name, value: '', ...options, maxAge: 0 }),
      },
    });

    await supabase.auth.signOut();

    return NextResponse.json({ ok: true, redirectTo: '/' });
  } catch (error) {
    logSafe('Logout failed', { error: error instanceof Error ? error.message : 'unknown' });
    return jsonError(error);
  }
}
