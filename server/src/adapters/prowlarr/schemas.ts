/**
 * Prowlarr's search answer, as recorded. Every field but the title is optional: Prowlarr passes on
 * what each indexer gave, and rows differ by indexer (AudiobookBay's have no hash and no magnet).
 */
import { z } from 'zod';

export const prowlarrRowSchema = z.object({
  title: z.string(),
  indexer: z.string().nullish(),
  protocol: z.string().nullish(),
  size: z.number().nullish(),
  seeders: z.number().nullish(),
  guid: z.string().nullish(),
  infoUrl: z.string().nullish(),
  downloadUrl: z.string().nullish(),
  magnetUrl: z.string().nullish(),
  infoHash: z.string().nullish(),
  /** How many files the torrent holds, where the indexer lists it. */
  files: z.number().int().nonnegative().nullish(),
});
export type ProwlarrRow = z.infer<typeof prowlarrRowSchema>;

/** The rows are parsed one by one, so that a malformed one costs only itself. */
export const prowlarrSearchSchema = z.array(z.unknown());

/** An indexer as Prowlarr lists it, read for its categories alone: the rest holds its settings. */
const categorySchema = z.object({
  id: z.number().int(),
  subCategories: z.array(z.object({ id: z.number().int() })).nullish(),
});
export const prowlarrIndexerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  enable: z.boolean(),
  protocol: z.string(),
  capabilities: z.object({ categories: z.array(categorySchema).nullish() }).nullish(),
});
export type ProwlarrIndexer = z.infer<typeof prowlarrIndexerSchema>;
export const prowlarrIndexersSchema = z.array(prowlarrIndexerSchema);

export const prowlarrStatusSchema = z.object({ version: z.string() });
