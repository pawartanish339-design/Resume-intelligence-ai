/**
 * Serialization helpers for JSON API payloads. Next.js refuses to serialize
 * `undefined` inside route-handler responses in some configurations, and
 * `JSON.stringify` silently drops object properties whose value is `undefined`
 * (which makes cache keys and snapshots unstable), so we normalise explicitly.
 */

export function omitUndefined<T>(value: T): T {
  return deepClean(value, false) as T;
}

/** Also drops null values -- for payloads where absence and null are equivalent. */
export function omitEmpty<T>(value: T): T {
  return deepClean(value, true) as T;
}

function deepClean(value: unknown, dropNull: boolean): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => deepClean(item, dropNull))
      .filter((item) => item !== undefined && (!dropNull || item !== null));
  }

  if (value && typeof value === 'object') {
    if (value instanceof Date) return value.toISOString();

    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = deepClean(nested, dropNull);
      if (cleaned === undefined) continue;
      if (dropNull && cleaned === null) continue;
      out[key] = cleaned;
    }
    return out;
  }

  return value;
}

/** Parse a JSON body defensively: invalid JSON becomes a 400-friendly error. */
export async function readJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error('INVALID_JSON');
  }
}

/** Round-trip through JSON so class instances become plain objects (for caches). */
export function toPlainObject<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
