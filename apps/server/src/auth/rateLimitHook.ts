import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendError } from '../httpErrors.js';
import type { RateLimiter } from './rateLimit.js';

/** A Fastify preHandler that 429s once `limiter` says this client IP is over budget. */
export function createRateLimitHook(limiter: RateLimiter) {
  return async function rateLimitHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const result = limiter.consume(request.ip);
    if (!result.allowed) {
      reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      sendError(reply, 429, 'rate_limited', 'Too many attempts — try again shortly');
    }
  };
}
