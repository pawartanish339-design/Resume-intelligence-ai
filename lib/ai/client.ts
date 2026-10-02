import { createOpenAI } from '@ai-sdk/openai';
import { embedMany, generateObject, type LanguageModelV1 } from 'ai';
import type { z } from 'zod';

import { getServerEnv } from '@/lib/env';
import { getCircuitBreaker } from '@/lib/utils/circuit-breaker';
import { withRetry, defaultIsRetryable } from '@/lib/utils/retry';
import { memoizeAsync } from '@/lib/utils/cache';
import { AppError, errorMessage, logSafe } from '@/lib/utils/errors';
import { type LlmCallStats } from '@/types/analysis';

/**
 * Provider access layer. Everything that talks to OpenAI goes through here so
 * that retries, the circuit breaker, timeouts, and accounting are applied
 * uniformly and can be exercised by tests through dependency injection.
 *
 * This module is server-only by construction: it reads OPENAI_API_KEY from the
 * server environment.
 */

let provider: ReturnType<typeof createOpenAI> | null = null;

export function getOpenAIProvider() {
  if (provider) return provider;
  const env = getServerEnv();
  provider = createOpenAI({ apiKey: env.OPENAI_API_KEY, compatibility: 'strict' });
  return provider;
}

export function getChatModel(modelId?: string): LanguageModelV1 {
  const env = getServerEnv();
  return getOpenAIProvider()(modelId ?? env.OPENAI_CHAT_MODEL);
}

export function getEmbeddingModel(modelId?: string) {
  const env = getServerEnv();
  return getOpenAIProvider().embedding(modelId ?? env.OPENAI_EMBEDDING_MODEL);
}

export const EMBEDDING_DIMENSIONS = 1536;

/** Process-wide breakers: one shared failure budget per upstream capability. */
export function llmBreaker() {
  return getCircuitBreaker('openai-chat', { failureThreshold: 5, openMs: 30_000 });
}

export function embeddingBreaker() {
  return getCircuitBreaker('openai-embeddings', { failureThreshold: 5, openMs: 30_000 });
}

export interface GenerateObjectOptions<T extends z.ZodTypeAny> {
  schema: T;
  system: string;
  prompt: string;
  /** Defaults to 0 -- determinism is a requirement, not a preference. */
  temperature?: number;
  maxTokens?: number;
  /** Overrides the configured chat model (used by tests). */
  modelId?: string;
  /** Injectable for tests. */
  generate?: typeof generateObject;
  /** Label used in logs + analytics metadata. */
  purpose: string;
}

export interface GenerateObjectResult<T> {
  object: T;
  stats: LlmCallStats;
}

/**
 * Temperature-0, schema-enforced generation wrapped in retry + circuit breaker.
 * Any provider failure surfaces as a typed 503 AppError the UI can explain.
 */
export async function generateStructuredObject<T extends z.ZodTypeAny>({
  schema,
  system,
  prompt,
  temperature = 0,
  maxTokens = 4_000,
  modelId,
  generate = generateObject,
  purpose,
}: GenerateObjectOptions<T>): Promise<GenerateObjectResult<z.infer<T>>> {
  const startedAt = Date.now();
  const breaker = llmBreaker();

  try {
    const result = await breaker.execute(() =>
      withRetry(
        () =>
          generate({
            model: getChatModel(modelId),
            schema,
            system,
            prompt,
            temperature,
            maxTokens,
          }),
        {
          attempts: 3,
          baseDelayMs: 500,
          isRetryable: defaultIsRetryable,
        },
      ),
    );

    const usage = (result as { usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } })
      .usage;

    return {
      object: (result as { object: z.infer<T> }).object,
      stats: {
        purpose,
        model: modelId ?? safeChatModelName(),
        temperature,
        duration_ms: Date.now() - startedAt,
        prompt_tokens: usage?.promptTokens ?? 0,
        completion_tokens: usage?.completionTokens ?? 0,
        total_tokens: usage?.totalTokens ?? 0,
        attempts: 1,
        ok: true,
      },
    };
  } catch (error) {
    logSafe('LLM call failed', { purpose, error: errorMessage(error) });
    throw new AppError(`Structured generation failed (${purpose}): ${errorMessage(error)}`, {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      userMessage:
        'The AI extraction service is temporarily unavailable. Please retry in a moment.',
      logContext: { purpose },
      cause: error,
    });
  }
}

function safeChatModelName(): string {
  try {
    return getServerEnv().OPENAI_CHAT_MODEL;
  } catch {
    return 'unknown';
  }
}

export interface EmbedManyResult {
  embeddings: number[][];
  stats: LlmCallStats;
}

/**
 * Batch embeddings. Callers must de-duplicate before calling: this function
 * additionally refuses empty input to avoid pointless round-trips.
 */
export async function embedTextBatch(
  values: string[],
  options: {
    modelId?: string;
    embed?: typeof embedMany;
    purpose?: string;
  } = {},
): Promise<EmbedManyResult> {
  if (values.length === 0) {
    return {
      embeddings: [],
      stats: {
        purpose: options.purpose ?? 'embed',
        model: options.modelId ?? safeEmbeddingModelName(),
        temperature: 0,
        duration_ms: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        attempts: 0,
        ok: true,
      },
    };
  }

  const startedAt = Date.now();
  const breaker = embeddingBreaker();
  const embedFn = options.embed ?? embedMany;

  try {
    const result = await breaker.execute(() =>
      withRetry(
        () =>
          embedFn({
            model: getEmbeddingModel(options.modelId),
            values,
          }),
        { attempts: 3, baseDelayMs: 500, isRetryable: defaultIsRetryable },
      ),
    );

    const usage = (result as { usage?: { tokens?: number } }).usage;
    const embeddings = (result as { embeddings: number[][] }).embeddings;

    return {
      embeddings,
      stats: {
        purpose: options.purpose ?? 'embed',
        model: options.modelId ?? safeEmbeddingModelName(),
        temperature: 0,
        duration_ms: Date.now() - startedAt,
        prompt_tokens: usage?.tokens ?? 0,
        completion_tokens: 0,
        total_tokens: usage?.tokens ?? 0,
        attempts: 1,
        ok: true,
      },
    };
  } catch (error) {
    logSafe('Embedding call failed', { error: errorMessage(error) });
    throw new AppError(`Embedding request failed: ${errorMessage(error)}`, {
      status: 503,
      code: 'UPSTREAM_UNAVAILABLE',
      userMessage: 'The semantic matching service is temporarily unavailable. Please retry in a moment.',
      cause: error,
    });
  }
}

function safeEmbeddingModelName(): string {
  try {
    return getServerEnv().OPENAI_EMBEDDING_MODEL;
  } catch {
    return 'text-embedding-3-small';
  }
}

// ---------------------------------------------------------------------------
// Health probes (cheap, cached for 60s)
// ---------------------------------------------------------------------------

export interface ProviderProbe {
  status: 'up' | 'down' | 'skipped';
  latency_ms: number;
  detail?: string;
}

/**
 * Cheapest possible chat-provider probe: list models (no tokens consumed).
 * Cached for 60 seconds so `/api/health` cannot be used as a billing amplifier.
 */
export const probeChatProvider = memoizeAsync(
  async (): Promise<ProviderProbe> => {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'skipped', latency_ms: 0, detail: 'OPENAI_API_KEY is not configured' };
    }

    const startedAt = Date.now();
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      });

      return {
        status: response.ok ? 'up' : 'down',
        latency_ms: Date.now() - startedAt,
        detail: response.ok ? 'models endpoint reachable' : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        status: 'down',
        latency_ms: Date.now() - startedAt,
        detail: errorMessage(error),
      };
    }
  },
  60_000,
  () => 'chat-probe',
);

/**
 * Embedding probe: a single, deterministic 1-token embedding. Cached for 60s.
 * Fallback to the models endpoint keeps the probe useful when embeddings are
 * temporarily rate limited.
 */
export const probeEmbeddingProvider = memoizeAsync(
  async (): Promise<ProviderProbe> => {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'skipped', latency_ms: 0, detail: 'OPENAI_API_KEY is not configured' };
    }

    const startedAt = Date.now();
    try {
      const { embed } = await import('ai');
      const env = getServerEnv();

      const result = await embed({
        model: getEmbeddingModel(env.OPENAI_EMBEDDING_MODEL),
        value: 'health',
      });

      const dimensions = Array.isArray(result.embedding) ? result.embedding.length : 0;
      return {
        status: dimensions > 0 ? 'up' : 'down',
        latency_ms: Date.now() - startedAt,
        detail: `${env.OPENAI_EMBEDDING_MODEL} (${dimensions} dims)`,
      };
    } catch (error) {
      return { status: 'down', latency_ms: Date.now() - startedAt, detail: errorMessage(error) };
    }
  },
  60_000,
  () => 'embedding-probe',
);

/** Token accounting accumulator used by the analysis pipeline. */
export class LlmUsageTracker {
  private calls: LlmCallStats[] = [];

  record(stats: LlmCallStats): void {
    this.calls.push(stats);
  }

  get all(): LlmCallStats[] {
    return [...this.calls];
  }

  get totalTokens(): number {
    return this.calls.reduce((total, call) => total + call.total_tokens, 0);
  }

  get totalDurationMs(): number {
    return this.calls.reduce((total, call) => total + call.duration_ms, 0);
  }

  summary(): { calls: number; total_tokens: number; total_ms: number; by_purpose: Record<string, number> } {
    const byPurpose: Record<string, number> = {};
    for (const call of this.calls) {
      byPurpose[call.purpose] = (byPurpose[call.purpose] ?? 0) + call.total_tokens;
    }
    return {
      calls: this.calls.length,
      total_tokens: this.totalTokens,
      total_ms: this.totalDurationMs,
      by_purpose: byPurpose,
    };
  }
}
