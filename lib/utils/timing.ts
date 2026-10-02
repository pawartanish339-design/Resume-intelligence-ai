/**
 * Tiny timing helpers used by the analysis pipeline to record per-stage
 * durations in analytics metadata. Kept separate from the services so tests can
 * inject deterministic clocks when needed.
 */

export interface Stopwatch {
  /** Milliseconds elapsed since the stopwatch started. */
  elapsed(): number;
  /** Stop and return the elapsed milliseconds. */
  stop(): number;
}

export function startStopwatch(now: () => number = () => Date.now()): Stopwatch {
  const startedAt = now();
  let stopped: number | null = null;

  return {
    elapsed: () => (stopped ?? now()) - startedAt,
    stop: () => {
      stopped = now();
      return stopped - startedAt;
    },
  };
}

/**
 * Usage: `const t = measure(); ... ; const ms = t();`
 * The returned function reports elapsed milliseconds (or the duration between
 * successive calls when called repeatedly).
 */
export function measure(now: () => number = () => Date.now()): () => number {
  let last = now();
  return () => {
    const current = now();
    const delta = current - last;
    last = current;
    return delta;
  };
}

export interface StageTimings {
  [stage: string]: number;
}

/** Run an async function, capturing its duration without altering behaviour. */
export async function timed<T>(
  fn: () => Promise<T>,
  record: (durationMs: number) => void,
  now: () => number = () => Date.now(),
): Promise<T> {
  const startedAt = now();
  try {
    return await fn();
  } finally {
    record(now() - startedAt);
  }
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0ms';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
