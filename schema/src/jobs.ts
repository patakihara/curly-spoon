/**
 * What admin sees of the server's background jobs. Today that is the extractor's: its state, the
 * version in use, what its canary last said of each version, and of the direct resolve (YouTube's
 * player, asked ahead of the extractor). A reason is one word, never the extractor's own output.
 */
import { z } from './zod.js';

export const JobVersion = z
  .object({
    version: z.string(),
    source: z.enum(['image', 'release', 'nightly']),
    state: z.enum(['promoted', 'kept', 'failed']),
    canaryAt: z.number().nullable(),
    canaryMs: z.number().nullable(),
    tier: z.string().nullable(),
    reason: z.string().nullable(),
  })
  .openapi('JobVersion');
export type JobVersion = z.infer<typeof JobVersion>;

export const JobName = z.enum(['extractor']).openapi('JobName');

/** The canary's last word on the direct resolve; null before its first run. */
export const JobDirect = z
  .object({ passed: z.boolean(), reason: z.string().nullable(), at: z.number() })
  .openapi('JobDirect');
export type JobDirect = z.infer<typeof JobDirect>;

export const Job = z
  .object({
    name: JobName,
    state: z.enum(['ok', 'unavailable']),
    reason: z.string().nullable(),
    current: z.string(),
    versions: z.array(JobVersion),
    direct: JobDirect.nullable(),
  })
  .openapi('Job');
export type Job = z.infer<typeof Job>;

export const JobList = z.object({ jobs: z.array(Job) }).openapi('JobList');
export type JobList = z.infer<typeof JobList>;

export const JobParams = z.object({ name: JobName });
