import { AppError } from '@/lib/utils/errors';

/**
 * CSRF defence for state-changing API requests.
 *
 * We combine three signals:
 *   1. `Origin` must match the request `Host` (or the configured site URL).
 *   2. `Sec-Fetch-Site`, when present, must be `same-origin` / `same-site` / `none`.
 *   3. Browsers that send neither header (rare, older clients) are rejected unless
 *      the request is clearly server-to-server (no cookies at all).
 *
 * Combined with SameSite=Lax session cookies this closes the classic CSRF hole.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface SameOriginOptions {
  /** Extra allowed origins (e.g. NEXT_PUBLIC_SITE_URL, preview host). */
  allowedOrigins?: string[];
}

export function isSameOrigin(request: Request, options: SameOriginOptions = {}): boolean {
  const method = request.method.toUpperCase();
  if (SAFE_METHODS.has(method)) return true;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const secFetchSite = request.headers.get('sec-fetch-site');

  if (secFetchSite && !['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
    return false;
  }

  if (!origin) {
    // No Origin header: reject only if the client shipped cookies (a browser would
    // have set Origin on a cross-site POST), otherwise allow server-to-server calls.
    const hasCookie = Boolean(request.headers.get('cookie'));
    return !hasCookie;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  if (host && originHost === host) return true;

  const extras = new Set(
    [
      ...(options.allowedOrigins ?? []),
      process.env.NEXT_PUBLIC_SITE_URL,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => {
        try {
          return new URL(value).host;
        } catch {
          return value;
        }
      }),
  );

  return extras.has(originHost);
}

/** Throws a 403 AppError when the request fails the same-origin check. */
export function assertSameOrigin(request: Request, options: SameOriginOptions = {}): void {
  if (isSameOrigin(request, options)) return;
  throw new AppError('Cross-site request rejected by same-origin policy', {
    status: 403,
    code: 'CSRF_REJECTED',
    userMessage:
      'The request was rejected because it did not originate from this site. Reload the page and try again.',
    logContext: {
      method: request.method,
      origin: request.headers.get('origin'),
      host: request.headers.get('host'),
      secFetchSite: request.headers.get('sec-fetch-site'),
    },
  });
}

/** Best-effort client IP for rate limiting and audit rows. */
export function getClientIp(request: Request): string | null {
  const candidates = [
    request.headers.get('x-forwarded-for')?.split(',')[0],
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
  ];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value) return value;
  }
  return null;
}
