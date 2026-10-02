import { NextResponse } from 'next/server';

import { probeDatabase, probeStorage } from '@/lib/db/admin';
import { probeChatProvider, probeEmbeddingProvider } from '@/lib/ai/client';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { getClientIp } from '@/lib/utils/same-origin';
import { isServerEnvComplete } from '@/lib/env';
import type { HealthResponse, HealthServiceStatus } from '@/types/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEALTH_CACHE_MS = 10_000;
let cachedResponse: { body: HealthResponse; expiresAt: number } | null = null;

/**
 * GET /api/health -- public liveness/readiness probe.
 *
 * All checks are cheap and individually cached for 60s (provider probes) or 10s
 * (this endpoint), so the route cannot be used to amplify spend on the LLM APIs.
 */
export async function GET(request: Request) {
  // Public route: rate limited by IP rather than by account.
  try {
    await checkRateLimit('health', `health:${getClientIp(request) ?? 'anonymous'}`);
  } catch {
    // Never fail health checks because of the limiter itself.
  }

  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return NextResponse.json(cachedResponse.body, {
      headers: { 'cache-control': 'no-store' },
    });
  }

  const envComplete = isServerEnvComplete();

  const [database, storage, llm, embeddings] = await Promise.all([
    envComplete ? probeDatabase().catch(() => ({ status: 'down' as const, latency_ms: 0, detail: 'probe failed' })) : Promise.resolve({ status: 'skipped' as const, latency_ms: 0, detail: 'environment not configured' }),
    envComplete ? probeStorage().catch(() => ({ status: 'down' as const, latency_ms: 0, detail: 'probe failed' })) : Promise.resolve({ status: 'skipped' as const, latency_ms: 0, detail: 'environment not configured' }),
    probeChatProvider().catch(() => ({ status: 'down' as const, latency_ms: 0, detail: 'probe failed' })),
    probeEmbeddingProvider().catch(() => ({ status: 'down' as const, latency_ms: 0, detail: 'probe failed' })),
  ]);

  const services = {
    database: normalise(database),
    storage: normalise(storage),
    llm_provider: normalise(llm),
    vector_service: normalise(embeddings),
  };

  const downCount = Object.values(services).filter((service) => service.status === 'down').length;
  const skippedCount = Object.values(services).filter((service) => service.status === 'skipped').length;

  const status: HealthResponse['status'] =
    downCount === 0 && skippedCount === 0
      ? 'healthy'
      : downCount >= 2
        ? 'unhealthy'
        : 'degraded';

  const body: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    service: 'resume-analyzer',
    version: process.env.npm_package_version ?? '1.0.0',
    services,
  };

  cachedResponse = { body, expiresAt: Date.now() + HEALTH_CACHE_MS };

  return NextResponse.json(body, {
    status: status === 'unhealthy' ? 503 : 200,
    headers: { 'cache-control': 'no-store' },
  });
}

function normalise(probe: {
  status: 'up' | 'down' | 'skipped';
  latency_ms: number;
  detail?: string;
}): HealthServiceStatus {
  return {
    status: probe.status,
    latency_ms: probe.latency_ms,
    ...(probe.detail ? { detail: probe.detail } : {}),
  };
}
