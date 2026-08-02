/** Zod schemas for the BFF's own request boundary (params/query/body) — see validation.ts. */

import { z } from 'zod';

// Query strings are always raw text, so a plain `z.boolean()` would reject `"true"`.
// `Boolean("false")` is also `true`, so `z.coerce.boolean()` is wrong here too — accept
// the literal tokens a client would actually send and normalise those.
const boolQueryParam = z
  .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true' || v === '1'));

export const idParamSchema = z.object({ id: z.string().min(1) });
export const itemIdParamSchema = z.object({ itemId: z.string().min(1) });
export const itemEpisodeParamSchema = z.object({
  itemId: z.string().min(1),
  episodeId: z.string().min(1),
});
export const mediaTrackParamSchema = z.object({
  itemId: z.string().min(1),
  fileId: z.string().min(1),
});
export const progressQuerySchema = z.object({
  episodeId: z.string().min(1).optional(),
});

export const libraryItemsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  page: z.coerce.number().int().min(0).optional(),
  sort: z.string().optional(),
  desc: boolQueryParam,
  filter: z.string().optional(),
  minified: boolQueryParam,
  collapseseries: boolQueryParam,
});

export const getItemQuerySchema = z.object({
  expanded: boolQueryParam,
  include: z.enum(['progress']).optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'q is required'),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const seriesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  page: z.coerce.number().int().min(0).optional(),
});

export const loginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const setupBodySchema = z.object({
  baseUrl: z.string().url('baseUrl must be a valid absolute URL'),
});

export const syncBodySchema = z.object({
  currentTime: z.number().min(0),
  timeListened: z.number().min(0),
  duration: z.number().min(0),
});

export const updateProgressBodySchema = z.object({
  currentTime: z.number().min(0).optional(),
  duration: z.number().min(0).optional(),
  progress: z.number().min(0).max(1).optional(),
  isFinished: z.boolean().optional(),
});

export const coverQuerySchema = z.object({
  width: z.coerce.number().int().positive().max(4000).optional(),
  height: z.coerce.number().int().positive().max(4000).optional(),
  format: z.enum(['jpeg', 'webp', 'png']).optional(),
});
