import { NextResponse, type NextRequest } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ZodError, type z, type ZodTypeAny } from 'zod';

import {
  createRouteHandlerSupabaseClient,
  isAdminContext,
  type SessionContext,
} from '@/lib/db/server';
import { assertSameOrigin, getClientIp } from '@/lib/utils/same-origin';
import { buildRateLimitKey, enforceRateLimit, type RateLimitKind } from '@/lib/utils/rate-limit';
import { AppError, jsonError, logSafe, errorMessage } from '@/lib/utils/errors';
import { isServerEnvComplete } from '@/lib/env';
import type { ProfileRow } from '@/lib/db/types';

/**
 * Shared plumbing for API route handlers.
 *
 * Every handler built with `createRoute` gets, in order:
 *   1. same-origin (CSRF) enforcement for state-changing methods,
 *   2. rate limiting,
 *   3. a verified session (`supabase.auth.getUser()`, never client-supplied ids),
 *   4. suspended-account blocking,
 *   5. a typed JSON error envelope -- including for unexpected throws.
 */

export interface RouteContext<TParams = Record<string, string>> {
  request: NextRequest;
  params: TParams;
  supabase: SupabaseClient;
  user: User;
  profile: ProfileRow | null;
  ip: string | null;
  /** Parsed + validated query string values. */
  searchParams: URLSearchParams;
}

export interface RouteOptions<TParams> {
  /** Rate limit bucket, or null to skip (health checks define their own). */
  rateLimit: RateLimitKind | null;
  /** Require a valid session (default true). */
  auth?: boolean;
  /** Require app_metadata.role === 'admin'. */
  admin?: boolean;
  /** Extra rate-limit key suffix (e.g. the email being attempted). */
  rateLimitExtra?: (request: NextRequest, params: TParams) => string | undefined;
  /** Skip the CSRF check (never for browser-facing mutations). */
  skipSameOrigin?: boolean;
}

/**
 * Fail fast with a friendly envelope when the deployment is missing credentials.
 *
 * Routes built with `createRoute` call this automatically; the hand-written auth
 * handlers call it explicitly so a fresh checkout answers 503 with an explanation
 * instead of a generic 500.
 */
export function assertServerEnvConfigured(): void {
  if (isServerEnvComplete()) return;

  throw new AppError('Server environment is not configured', {
    status: 503,
    code: 'UPSTREAM_UNAVAILABLE',
    userMessage:
      'The service is not fully configured yet. An administrator needs to set the environment variables.',
  });
}

type Handler<TParams> = (
  context: RouteContext<TParams>,
) => Promise<NextResponse | Response | unknown>;

function isResponse(value: unknown): value is Response {
  return value instanceof Response || value instanceof NextResponse;
}

export function createRoute<TParams extends Record<string, string> = Record<string, string>>(
  options: RouteOptions<TParams>,
  handler: Handler<TParams>,
) {
  return async (
    request: NextRequest,
    routeContext?: { params: TParams } | TParams,
  ): Promise<NextResponse | Response> => {
    const params = (
      routeContext && typeof routeContext === 'object' && 'params' in routeContext
        ? (routeContext as { params: TParams }).params
        : (routeContext as TParams | undefined)
    ) ?? ({} as TParams);

    try {
      if (!options.skipSameOrigin) {
        assertSameOrigin(request);
      }

      assertServerEnvConfigured();

      const ip = getClientIp(request);

      let session: SessionContext | null = null;
      if (options.auth !== false) {
        const supabase = createRouteHandlerSupabaseClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
          throw new AppError('No authenticated session', {
            status: 401,
            code: 'UNAUTHORIZED',
            userMessage: 'You must be signed in to perform this action.',
          });
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, status, created_at')
          .eq('id', data.user.id)
          .maybeSingle<ProfileRow>();

        session = { supabase, user: data.user, profile: profile ?? null };

        if (profile?.status === 'suspended') {
          throw new AppError('Account suspended', {
            status: 403,
            code: 'SUSPENDED',
            userMessage:
              'This account has been suspended. Contact an administrator if you believe this is a mistake.',
          });
        }

        if (options.admin && !isAdminContext(session)) {
          throw new AppError('Administrator role required', {
            status: 403,
            code: 'FORBIDDEN',
            userMessage: 'You do not have permission to perform this action.',
          });
        }
      }

      if (options.rateLimit) {
        const extra = options.rateLimitExtra?.(request, params);
        const key = `${buildRateLimitKey({
          userId: session?.user.id ?? null,
          request,
          extra,
        })}`;
        await enforceRateLimit(options.rateLimit, key);
      }

      const result = await handler({
        request,
        params,
        supabase: session?.supabase ?? createRouteHandlerSupabaseClient(),
        user: (session?.user ?? null) as User,
        profile: session?.profile ?? null,
        ip,
        searchParams: new URL(request.url).searchParams,
      });

      if (isResponse(result)) return result;
      return NextResponse.json(result ?? { success: true });
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(
          new AppError('Request validation failed', {
            status: 400,
            code: 'BAD_REQUEST',
            userMessage: error.issues[0]?.message ?? 'Invalid request payload.',
            logContext: { issues: error.issues.map((issue) => issue.path.join('.')) },
          }),
        );
      }

      if (!(error instanceof AppError)) {
        logSafe('Unhandled route error', { error: errorMessage(error), path: request.nextUrl.pathname });
      }

      return jsonError(error);
    }
  };
}

/** Validate JSON bodies with a Zod schema and a typed error message. */
export async function parseJsonBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('Malformed JSON body', {
      status: 400,
      code: 'BAD_REQUEST',
      userMessage: 'The request body could not be parsed. Reload the page and try again.',
    });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('Request validation failed', {
      status: 400,
      code: 'BAD_REQUEST',
      userMessage: parsed.error.issues[0]?.message ?? 'Invalid request payload.',
    });
  }

  return parsed.data as z.output<S>;
}

export function parseSearchParams<S extends ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: S,
): z.output<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) raw[key] = value;

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('Invalid query parameters', {
      status: 400,
      code: 'BAD_REQUEST',
      userMessage: parsed.error.issues[0]?.message ?? 'Invalid query parameters.',
    });
  }
  return parsed.data as z.output<S>;
}
