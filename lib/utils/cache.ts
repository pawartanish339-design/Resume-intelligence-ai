/**
 * Small, dependency-free helpers used by the security layer (masking, hashing,
 * caching). Kept separate so tests can import them without pulling in service code.
 */

/** Deterministic LRU with an optional TTL. Used for embeddings + provider caches. */
export class LruCache<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number | null }>();

  constructor(
    private readonly maxEntries = 500,
    private readonly ttlMs: number | null = null,
  ) {}

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, {
      value,
      expiresAt: this.ttlMs === null ? null : Date.now() + this.ttlMs,
    });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Memoize an async function by its (stringified) key, with TTL in milliseconds. */
export function memoizeAsync<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  ttlMs: number,
  keyFn: (...args: A) => string = (...args) => JSON.stringify(args),
): (...args: A) => Promise<R> {
  const cache = new LruCache<string, R>(200, ttlMs);
  const inflight = new Map<string, Promise<R>>();

  return async (...args: A): Promise<R> => {
    const key = keyFn(...args);
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    const pending = inflight.get(key);
    if (pending) return pending;

    const promise = fn(...args)
      .then((result) => {
        cache.set(key, result);
        inflight.delete(key);
        return result;
      })
      .catch((error: unknown) => {
        inflight.delete(key);
        throw error;
      });

    inflight.set(key, promise);
    return promise;
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamp a number into [min, max]; NaN becomes min. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Round to a fixed number of decimals (half-up), guarding against -0 and NaN. */
export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON * Math.sign(value)) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Bounded concurrency map -- protects the embeddings API from burst limit errors. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length || 1));

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
