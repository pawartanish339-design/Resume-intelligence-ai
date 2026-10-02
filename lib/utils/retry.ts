import { sleep } from '@/lib/utils/cache';
import { errorMessage } from '@/lib/utils/errors';

/**
 * Retry with exponential backoff (500ms -> 1s -> 2s by default) plus jitter.
 * Only errors for which `isRetryable` returns true are retried; everything else
 * propagates immediately so we never mask a schema/validation bug as a timeout.
 */

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  isRetryable?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Injected for tests (defaults to real timers). */
  delayFn?: (ms: number) => Promise<void>;
}

export const DEFAULT_RETRY_DELAYS = [500, 1000, 2000] as const;

export function defaultIsRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  const status = (error as { status?: number; statusCode?: number }).status
    ?? (error as { statusCode?: number }).statusCode;

  if (typeof status === 'number') {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  return [
    'timeout',
    'timed out',
    'etimedout',
    'econnreset',
    'econnrefused',
    'enotfound',
    'socket hang up',
    'fetch failed',
    'rate limit',
    'overloaded',
    'temporarily unavailable',
    'service unavailable',
  ].some((needle) => message.includes(needle));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelay = options.baseDelayMs ?? DEFAULT_RETRY_DELAYS[0];
  const maxDelay = options.maxDelayMs ?? 2_000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const delayFn = options.delayFn ?? sleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const canRetry = attempt < attempts && isRetryable(error, attempt);
      if (!canRetry) throw error;

      const exponential = Math.min(maxDelay, baseDelay * 2 ** (attempt - 1));
      const jitter = exponential * jitterRatio * (Math.random() * 2 - 1);
      const delayMs = Math.max(0, Math.round(exponential + jitter));

      options.onRetry?.(error, attempt, delayMs);
      // eslint-disable-next-line no-console
      console.warn(
        `[resume-analyzer] retry ${attempt}/${attempts - 1} after ${delayMs}ms: ${errorMessage(error)}`,
      );
      await delayFn(delayMs);
    }
  }

  throw lastError;
}

/** Deterministic delay sequence -- handy in tests to assert backoff behaviour. */
export function nextDelaySequence(attempts: number, baseDelayMs = 500, maxDelayMs = 2_000): number[] {
  const delays: number[] = [];
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    delays.push(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
  }
  return delays;
}
