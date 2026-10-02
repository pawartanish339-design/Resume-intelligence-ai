import { z } from 'zod';

/**
 * Environment validation.
 *
 * The schema is validated *lazily* (on first property access) so that:
 *   - unit tests can import modules that reference configuration without booting secrets;
 *   - `next build` does not fail on a machine that has not created `.env.local` yet.
 *
 * The first access of a missing variable throws a single, explicit error listing
 * every missing variable instead of a generic "undefined is not a string".
 */

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is too short'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10, 'SUPABASE_SERVICE_ROLE_KEY is too short'),
  OPENAI_API_KEY: z.string().min(10, 'OPENAI_API_KEY is too short'),
  OPENAI_CHAT_MODEL: z.string().min(1).default('gpt-4o-mini'),
  OPENAI_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('resumes'),
  UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional().or(z.literal('').transform(() => undefined)),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Variables that must be present for the app to do anything useful. */
const REQUIRED_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY',
] as const;

function readRaw(): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_CHAT_MODEL: process.env.OPENAI_CHAT_MODEL,
    OPENAI_EMBEDDING_MODEL: process.env.OPENAI_EMBEDDING_MODEL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    NODE_ENV: process.env.NODE_ENV,
  };
}

export class EnvValidationError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      [
        'Environment configuration is incomplete.',
        `Missing or invalid variables: ${missing.join(', ')}.`,
        'Copy .env.example to .env.local and fill in the values, then restart the dev server.',
      ].join('\n'),
    );
    this.name = 'EnvValidationError';
    this.missing = missing;
  }
}

let cached: ServerEnv | null = null;
let cachedError: EnvValidationError | null = null;

/**
 * Validate and return the server environment. Throws EnvValidationError listing
 * every missing variable at once. Cached for the lifetime of the process.
 */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  if (cachedError) throw cachedError;

  const raw = readRaw();
  const parsed = serverEnvSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.path.join('.') || 'unknown');
    cachedError = new EnvValidationError(Array.from(new Set(issues)));
    throw cachedError;
  }

  const missing = REQUIRED_KEYS.filter((key) => !raw[key] || raw[key] === '');
  if (missing.length > 0) {
    cachedError = new EnvValidationError([...missing]);
    throw cachedError;
  }

  cached = parsed.data;
  return cached;
}

/** True when every required variable is present (never throws). */
export function isServerEnvComplete(): boolean {
  try {
    getServerEnv();
    return true;
  } catch {
    return false;
  }
}

/** Values that are safe to surface to the browser. */
export function getPublicEnv() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  };
}

/** Upstash is optional: when absent the in-memory limiter takes over. */
export function isUpstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || 'resumes';
}

/**
 * Convenience accessor: `env.OPENAI_CHAT_MODEL`.
 * Validation happens on first property read, not at import time.
 */
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== 'string') return undefined;
    return getServerEnv()[prop as keyof ServerEnv];
  },
  has(_target, prop: string | symbol) {
    if (typeof prop !== 'string') return false;
    return prop in getServerEnv();
  },
  ownKeys() {
    return Object.keys(getServerEnv());
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    if (typeof prop !== 'string') return undefined;
    const value = getServerEnv()[prop as keyof ServerEnv];
    return { value, enumerable: true, configurable: true, writable: false };
  },
});

/** Test helper: clears the memoized validation result. */
export function resetEnvCache(): void {
  cached = null;
  cachedError = null;
}
