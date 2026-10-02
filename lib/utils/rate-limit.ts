import { LruCache } from '@/lib/utils/cache';
import { isUpstashConfigured } from '@/lib/env';
import { AppError } from '@/lib/utils/errors';
import { getClientIp } from '@/lib/utils/same-origin';

/**
 * Rate limiting with a graceful degradation path.
 *
 * - When UPSTASH_REDIS_REST_URL/TOKEN are configured we use Upstash's sliding
 *   window (@upstash/ratelimit) so limits are shared across serverless instances.
 * - Otherwise an in-process sliding-window limiter is used. That is good enough
 *   for local development and single-instance deployments, and it means the app
 *   boots with zero extra setup.
 */

export type RateLimitKind = 'auth' | 'upload' | 'analyze' | 'admin' | 'read' | 'health' | 'mutate';

export interface RateLimitRule {
  limit: number;
  windowMs: number;
  label: string;
}

export const RATE_LIMIT_RULES: Record<RateLimitKind, RateLimitRule> = {
  auth: { limit: 5, windowMs: 60_000, label: 'authentication attempts' },
  upload: { limit: 10, windowMs: 60_000, label: 'uploads' },
  analyze: { limit: 6, windowMs: 60_000, label: 'analyses' },
  admin: { limit: 60, windowMs: 60_000, label: 'admin requests' },
  read: { limit: 120, windowMs: 60_000, label: 'read requests' },
  health: { limit: 60, windowMs: 60_000, label: 'health checks' },
  mutate: { limit: 30, windowMs: 60_000, label: 'mutating requests' },
};

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  backend: 'upstash' | 'memory';
}

interface MemoryBucket {
  timestamps: number[];
}

const memoryStore = new LruCache<string, MemoryBucket>(5_000);

const upstashLimiters = new Map<RateLimitKind, unknown>();

async function getUpstashLimiter(kind: RateLimitKind): Promise<
  { limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }> } | null
> {
  if (!isUpstashConfigured()) return null;

  const existing = upstashLimiters.get(kind);
  if (existing) {
    return existing as {
      limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>;
    };
  }

  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL as string,
      token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
    });

    const rule = RATE_LIMIT_RULES[kind];
    const limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(rule.limit, `${Math.round(rule.windowMs / 1000)} s`),
      analytics: false,
      prefix: `resume-analyzer:${kind}`,
    });

    upstashLimiters.set(kind, limiter);
    return limiter as {
      limit: (key: string) => Promise<{ success: boolean; limit: number; remaining: number; reset: number }>;
    };
  } catch {
    // Redis misconfigured/unreachable: fall back to the in-memory limiter rather
    // than failing the request (availability over strictness for a non-critical control).
    return null;
  }
}

function memoryLimit(kind: RateLimitKind, identifier: string): RateLimitResult {
  const rule = RATE_LIMIT_RULES[kind];
  const key = `${kind}:${identifier}`;
  const now = Date.now();

  const bucket = memoryStore.get(key) ?? { timestamps: [] };
  const windowStart = now - rule.windowMs;
  bucket.timestamps = bucket.timestamps.filter((timestamp) => timestamp > windowStart);

  const success = bucket.timestamps.length < rule.limit;
  if (success) bucket.timestamps.push(now);
  memoryStore.set(key, bucket);

  const oldest = bucket.timestamps[0] ?? now;
  return {
    success,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - bucket.timestamps.length),
    reset: oldest + rule.windowMs,
    backend: 'memory',
  };
}

/** Non-throwing check; useful for `/api/health` style introspection. */
export async function checkRateLimit(kind: RateLimitKind, identifier: string): Promise<RateLimitResult> {
  const limiter = await getUpstashLimiter(kind);
  if (limiter) {
    try {
      const result = await limiter.limit(identifier);
      return { ...result, backend: 'upstash' };
    } catch {
      return memoryLimit(kind, identifier);
    }
  }
  return memoryLimit(kind, identifier);
}

/**
 * Throwing guard used at the top of every route handler.
 * Throws a 429 AppError carrying Retry-After metadata.
 */
export async function enforceRateLimit(kind: RateLimitKind, identifier: string): Promise<RateLimitResult> {
  const result = await checkRateLimit(kind, identifier);
  if (!result.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    throw new AppError(`Rate limit exceeded for ${RATE_LIMIT_RULES[kind].label}`, {
      status: 429,
      code: 'RATE_LIMITED',
      userMessage: `Too many ${RATE_LIMIT_RULES[kind].label}. Please wait ${retryAfterSeconds} second${
        retryAfterSeconds === 1 ? '' : 's'
      } and try again.`,
      logContext: { kind, identifier: identifier.slice(0, 64), retryAfterSeconds },
    });
  }
  return result;
}

/** Identifiers are hashed/truncated so raw emails never enter the limiter store. */
export function buildRateLimitKey(parts: {
  userId?: string | null;
  email?: string | null;
  request?: Request;
  extra?: string;
}): string {
  const ip = parts.request ? getClientIp(parts.request) : null;
  const identity = parts.userId ?? parts.email?.toLowerCase() ?? ip ?? 'anonymous';
  return [identity, parts.extra].filter(Boolean).join(':');
}

/** Test helper. */
export function resetMemoryRateLimits(): void {
  memoryStore.clear();
}

/** Test helper: inspect the backend in use. */
export function activeRateLimitBackend(): 'upstash' | 'memory' {
  return isUpstashConfigured() ? 'upstash' : 'memory';
}
