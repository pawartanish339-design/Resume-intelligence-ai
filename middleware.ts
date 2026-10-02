import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Edge middleware.
 *
 * Responsibilities:
 *   1. refresh the Supabase session cookies on every request,
 *   2. route-level access control (guests -> /login, authenticated -> /dashboard,
 *      /admin/* requires app_metadata.role === 'admin'),
 *   3. suspended-account blocking,
 *   4. security headers (CSP, X-Frame-Options, nosniff, Referrer-Policy,
 *      Permissions-Policy, HSTS in production).
 *
 * Middleware is an OPTIMISATION, never the authorisation boundary: every route
 * handler and server component re-verifies the session with supabase.auth.getUser()
 * and re-checks ownership.
 */

const PROTECTED_PREFIXES = ['/dashboard', '/resumes', '/analyses', '/settings', '/compare', '/admin'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`));
}

function buildContentSecurityPolicy(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  let supabaseOrigin = '';
  let supabaseRealtime = '';
  try {
    if (supabaseUrl) {
      const url = new URL(supabaseUrl);
      supabaseOrigin = url.origin;
      supabaseRealtime = `wss://${url.host}`;
    }
  } catch {
    supabaseOrigin = '';
  }

  const isDev = process.env.NODE_ENV !== 'production';

  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next.js injects inline bootstrap scripts; dev additionally needs eval for HMR.
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", supabaseOrigin, supabaseRealtime, ...(isDev ? ['ws:', 'wss:'] : [])].filter(Boolean),
    'frame-ancestors': ["'none'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
  };

  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', buildContentSecurityPolicy());
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()',
  );
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }

  return response;
}

function redirectTo(request: NextRequest, pathname: string, params?: Record<string, string>): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return applySecurityHeaders(NextResponse.redirect(url));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration we cannot make access decisions; render the app in its
  // "not configured" state rather than locking everyone out of the landing page.
  if (!supabaseUrl || !supabaseAnonKey) {
    return applySecurityHeaders(response);
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set(name, '');
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options, maxAge: 0 });
      },
    },
  });

  let user: { app_metadata?: Record<string, unknown> } | null = null;
  let suspended = false;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', (user as { id?: string }).id ?? '')
        .maybeSingle<{ status: string }>();

      suspended = profile?.status === 'suspended';
    }
  } catch {
    // Network issues with Supabase must not take the whole app down: treat as guest.
    user = null;
  }

  const authenticated = Boolean(user);
  const isAdmin = Boolean(user && (user.app_metadata ?? {}).role === 'admin');

  if (suspended) {
    if (pathname.startsWith('/api')) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error:
              'This account has been suspended. Contact an administrator if you believe this is a mistake.',
            code: 'SUSPENDED',
          },
          { status: 403 },
        ),
      );
    }
    if (pathname !== '/403') {
      return redirectTo(request, '/403', { reason: 'suspended' });
    }
    return applySecurityHeaders(response);
  }

  if (!authenticated && isProtected(pathname)) {
    const next = `${pathname}${request.nextUrl.search}`;
    return redirectTo(request, '/login', { next });
  }

  if (authenticated && isAuthPage(pathname) && pathname !== '/reset-password') {
    return redirectTo(request, '/dashboard');
  }

  if (pathname.startsWith('/admin') && !isAdmin) {
    return redirectTo(request, '/403', { reason: 'forbidden' });
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimisation, which do not
     * need session refresh and would only add latency.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff|woff2|ttf)$).*)',
  ],
};
