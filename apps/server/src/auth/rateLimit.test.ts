import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rateLimit.js';

describe('RateLimiter', () => {
  it('allows requests up to the configured max within a window', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 3 });
    const now = 0;
    expect(limiter.consume('1.2.3.4', now).allowed).toBe(true);
    expect(limiter.consume('1.2.3.4', now).allowed).toBe(true);
    expect(limiter.consume('1.2.3.4', now).allowed).toBe(true);
  });

  it('blocks the request once the max is exceeded, with a retryAfterMs', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 2 });
    const now = 0;
    limiter.consume('1.2.3.4', now);
    limiter.consume('1.2.3.4', now);
    const result = limiter.consume('1.2.3.4', now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBe(1000);
  });

  it('resets once the window elapses', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
    limiter.consume('1.2.3.4', 0);
    expect(limiter.consume('1.2.3.4', 500).allowed).toBe(false);
    expect(limiter.consume('1.2.3.4', 1001).allowed).toBe(true);
  });

  it('tracks distinct keys independently', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('b', 0).allowed).toBe(true);
    expect(limiter.consume('a', 0).allowed).toBe(false);
  });

  it('sweep removes only expired buckets', () => {
    const limiter = new RateLimiter({ windowMs: 1000, max: 1 });
    limiter.consume('expired', 0);
    limiter.consume('fresh', 900);
    limiter.sweep(1000);
    // 'expired' bucket reset at 1000, which is <= now(1000) so it's swept and allowed again.
    expect(limiter.consume('expired', 1000).allowed).toBe(true);
    // 'fresh' bucket resets at 1900, still active, so it remains blocked (max 1, already consumed).
    expect(limiter.consume('fresh', 1000).allowed).toBe(false);
  });
});
