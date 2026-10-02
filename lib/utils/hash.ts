import { createHash } from 'node:crypto';

/**
 * Content hashing used for caching (embeddings, extractions) and for the
 * determinism guarantee: identical inputs must produce identical outputs, so
 * every cache key is a SHA-256 of *normalized* content.
 */

export function normalizeForHash(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim()
    .toLowerCase();
}

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Stable hash of arbitrary JSON-serializable content (keys sorted). */
export function contentHash(value: unknown): string {
  return sha256(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return entries.reduce<Record<string, unknown>>((acc, [key, val]) => {
      acc[key] = sortDeep(val);
      return acc;
    }, {});
  }
  return value;
}

/** Hash of normalized text -- the cache key for extraction and embeddings. */
export function textHash(text: string): string {
  return sha256(normalizeForHash(text));
}

/** Namespaced cache key, e.g. cacheKey('extract', text). */
export function cacheKey(...parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((part) => String(part ?? '')).join('::');
}

/** Truncated hash for display in audit metadata (never reversible). */
export function shortHash(input: string, length = 12): string {
  return sha256(input).slice(0, length);
}
