/**
 * A minimal fixed-window rate limiter for auth routes (login is the main target —
 * brute-forcing credentials is the threat a BFF sitting in front of someone's home
 * media server most needs to slow down). No extra dependency: a `Map` keyed by
 * client IP is enough for the request volumes a self-hosted instance sees.
 */

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** How long the caller should wait before retrying, in ms. 0 when allowed. */
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly options: RateLimiterOptions) {}

  /** Record one attempt for `key` (typically the client IP); tell the caller whether it's allowed. */
  consume(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (bucket.count >= this.options.max) {
      return { allowed: false, retryAfterMs: bucket.resetAt - now };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drop expired buckets so long-lived processes don't accumulate one entry per IP forever. */
  sweep(now: number = Date.now()): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
