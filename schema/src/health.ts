import { z } from './zod.js';

/** What GET /health answers while the server is up. */
export const HealthResponse = z
  .object({
    status: z.literal('ok'),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof HealthResponse>;
