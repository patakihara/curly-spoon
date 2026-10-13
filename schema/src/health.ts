import { z } from './zod.js';

/** A full commit id, as `git rev-parse HEAD` prints it. */
export const CommitId = z.string().regex(/^[0-9a-f]{40}$/, 'a full 40-character commit id');

/** What GET /api/health answers while the server is up. */
export const HealthResponse = z
  .object({
    status: z.literal('ok'),
    /** The commit the running image was built from; null for a server not built into an image. */
    commit: CommitId.nullable(),
    /**
     * Whether the server has a household sign-on: with one, a signed-out visitor goes to sign in;
     * with none, nobody can sign in, and the web app draws the canvas's placeholders.
     */
    signOn: z.boolean(),
  })
  .openapi('HealthResponse');

export type HealthResponse = z.infer<typeof HealthResponse>;
