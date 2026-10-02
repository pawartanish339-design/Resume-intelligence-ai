import { LruCache } from '@/lib/utils/cache';

/**
 * Circuit breaker: after `failureThreshold` consecutive failures the circuit
 * opens for `openMs`; while open, calls fail fast with a typed error instead of
 * hammering a struggling upstream (OpenAI). A single trial call ("half-open")
 * is allowed once the cooldown elapses.
 */

export class CircuitOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(name: string, retryAfterMs: number) {
    super(`Circuit breaker "${name}" is open. Retry in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

export interface CircuitBreakerOptions {
  name?: string;
  failureThreshold?: number;
  openMs?: number;
  /** Optional hook for telemetry (analytics events). */
  onStateChange?: (state: CircuitState, name: string) => void;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  readonly name: string;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private readonly onStateChange?: (state: CircuitState, name: string) => void;

  private failures = 0;
  private openedAt = 0;
  private state: CircuitState = 'closed';

  constructor(options: CircuitBreakerOptions = {}) {
    this.name = options.name ?? 'default';
    this.failureThreshold = options.failureThreshold ?? 5;
    this.openMs = options.openMs ?? 30_000;
    this.onStateChange = options.onStateChange;
  }

  getState(): CircuitState {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.openMs) {
      return 'half-open';
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  /** Milliseconds until a half-open trial is allowed (0 when not open). */
  retryAfterMs(): number {
    if (this.state !== 'open') return 0;
    return Math.max(0, this.openMs - (Date.now() - this.openedAt));
  }

  private setState(next: CircuitState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next, this.name);
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const effective = this.getState();

    if (effective === 'open') {
      throw new CircuitOpenError(this.name, this.retryAfterMs() || this.openMs);
    }
    if (effective === 'half-open') {
      this.setState('half-open');
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.setState('closed');
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = Date.now();
      this.setState('open');
    } else if (this.state === 'half-open') {
      // A failed trial re-opens the circuit immediately.
      this.openedAt = Date.now();
      this.setState('open');
    }
  }

  /** Test/maintenance helper. */
  reset(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.state = 'closed';
  }
}

const registry = new LruCache<string, CircuitBreaker>(50);

/** Process-wide named breaker (e.g. `getCircuitBreaker('openai')`). */
export function getCircuitBreaker(name: string, options: Omit<CircuitBreakerOptions, 'name'> = {}): CircuitBreaker {
  const existing = registry.get(name);
  if (existing) return existing;
  const breaker = new CircuitBreaker({ name, ...options });
  registry.set(name, breaker);
  return breaker;
}

export function resetAllCircuitBreakers(): void {
  registry.clear();
}
