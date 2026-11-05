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
});
export type ProwlarrRow = z.infer<typeof prowlarrRowSchema>;

export const prowlarrSearchSchema = z.array(prowlarrRowSchema);

export const prowlarrStatusSchema = z.object({ version: z.string() });
