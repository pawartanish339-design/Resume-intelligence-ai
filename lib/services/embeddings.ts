import { embedTextBatch, EMBEDDING_DIMENSIONS } from '@/lib/ai/client';
import { LruCache, chunk } from '@/lib/utils/cache';
import { cacheKey, textHash } from '@/lib/utils/hash';
import type { LlmCallStats } from '@/types/analysis';

/**
 * Embedding utilities.
 *
 * Two guarantees matter downstream:
 *   1. Determinism: the same text always maps to the same cached vector, keyed by a
 *      SHA-256 of the normalized string, so an identical analysis run is identical.
 *   2. Cost control: a single batched call per analysis for de-duplicated strings,
 *      backed by an in-process LRU cache.
 */

/** Cosine similarity for equal-length vectors. Zero vectors return 0 (never NaN). */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;

  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < length; index += 1) {
    const valueA = a[index] as number;
    const valueB = b[index] as number;
    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (normA === 0 || normB === 0) return 0;

  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  // Clamp for float noise so callers can rely on the [0, 1] contract.
  return Math.min(1, Math.max(0, similarity));
}

/** Pretty-printed similarity for logs/diagnostics (never shown raw to users). */
export function formatSimilarity(value: number): string {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}

export interface EmbeddingVectorCacheEntry {
  hash: string;
  vector: number[];
}

const vectorCache = new LruCache<string, number[]>(2_000);

export interface EmbedStringsResult {
  vectors: Map<string, number[]>;
  stats: LlmCallStats | null;
  cacheHits: number;
  embeddedCount: number;
}

export interface EmbedStringsOptions {
  modelId?: string;
  /** Injectable for tests and for offline/deterministic runs. */
  embed?: typeof embedTextBatch;
  /** Max texts per API call. */
  batchSize?: number;
  purpose?: string;
}

/**
 * Embed a de-duplicated list of strings with caching.
 * Returns a Map keyed by the ORIGINAL string (not the normalized form).
 */
export async function embedStrings(
  strings: string[],
  options: EmbedStringsOptions = {},
): Promise<EmbedStringsResult> {
  const unique = Array.from(new Set(strings.map((value) => value.trim()).filter((value) => value.length > 0)));
  const vectors = new Map<string, number[]>();

  const pending: Array<{ original: string; key: string }> = [];
  let cacheHits = 0;

  for (const original of unique) {
    const key = cacheKey('emb', options.modelId ?? process.env.OPENAI_EMBEDDING_MODEL ?? 'default', textHash(original));
    const cached = vectorCache.get(key);
    if (cached) {
      vectors.set(original, cached);
      cacheHits += 1;
      continue;
    }
    pending.push({ original, key });
  }

  if (pending.length === 0) {
    return { vectors, stats: null, cacheHits, embeddedCount: 0 };
  }

  const embedFn = options.embed ?? embedTextBatch;
  const batchSize = options.batchSize ?? 96;
  const batches = chunk(pending, batchSize);
  const allStats: LlmCallStats[] = [];

  for (const batch of batches) {
    const { embeddings, stats } = await embedFn(
      batch.map((entry) => entry.original),
      { modelId: options.modelId, purpose: options.purpose ?? 'embed' },
    );
    allStats.push(stats);

    batch.forEach((entry, index) => {
      const vector = embeddings[index];
      if (!vector) return;
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        // Providers occasionally change defaults; normalise length expectations.
        // We keep the vector as-is (cosine is length agnostic) but do not cache a
        // mismatched dimension count to avoid serving wrong-shaped vectors later.
        vectors.set(entry.original, vector);
        return;
      }
      vectorCache.set(entry.key, vector);
      vectors.set(entry.original, vector);
    });
  }

  const aggregated: LlmCallStats = allStats.reduce<LlmCallStats>(
    (total, stats) => ({
      purpose: stats.purpose,
      model: stats.model,
      temperature: stats.temperature,
      duration_ms: total.duration_ms + stats.duration_ms,
      prompt_tokens: total.prompt_tokens + stats.prompt_tokens,
      completion_tokens: 0,
      total_tokens: total.total_tokens + stats.total_tokens,
      attempts: total.attempts + stats.attempts,
      ok: total.ok && stats.ok,
    }),
    {
      purpose: options.purpose ?? 'embed',
      model: allStats[0]?.model ?? 'unknown',
      temperature: 0,
      duration_ms: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      attempts: 0,
      ok: true,
    },
  );

  return {
    vectors,
    stats: aggregated,
    cacheHits,
    embeddedCount: pending.length,
  };
}

/** Best cosine similarity between one query vector and a set of candidates. */
export function bestSimilarity(
  query: readonly number[],
  candidates: ReadonlyArray<readonly number[]>,
): number {
  let best = 0;
  for (const candidate of candidates) {
    const similarity = cosineSimilarity(query, candidate);
    if (similarity > best) best = similarity;
  }
  return best;
}

/** Test helper: clear the embedding cache. */
export function resetEmbeddingCache(): void {
  vectorCache.clear();
}

export function embeddingCacheSize(): number {
  return vectorCache.size;
}
