/**
 * qBittorrent's Web API answers, as recorded. A row keeps only what Auralis reads; its state stays
 * a plain string, as an unknown one is a failed download and not a parse error.
 */
import { z } from 'zod';

export const qbitTorrentSchema = z.object({
  hash: z.string(),
  state: z.string(),
  progress: z.number(),
  category: z.string(),
  /** Comma-separated. */
  tags: z.string(),
  /** Seconds since 1970. */
  added_on: z.number(),
  save_path: z.string(),
});
export type QbitTorrent = z.infer<typeof qbitTorrentSchema>;

export const qbitTorrentsSchema = z.array(qbitTorrentSchema);

export const qbitFileSchema = z.object({
  /** What a priority names the file by. */
  index: z.number().int().nonnegative(),
  /** Relative to the torrent's save path. */
  name: z.string(),
  size: z.number(),
});
export type QbitFile = z.infer<typeof qbitFileSchema>;

export const qbitFilesSchema = z.array(qbitFileSchema);

/** An add's answer: its counts, where nothing that was asked for may have failed. */
export const qbitAddSchema = z.object({ failure_count: z.number() });
