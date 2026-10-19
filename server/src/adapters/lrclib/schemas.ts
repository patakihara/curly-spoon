/**
 * Zod schema for the one LRCLIB call Auralis makes, `GET /api/get`, cut to what it reads (checked
 * live). `syncedLyrics` is LRC text, `[mm:ss.xx] line` per line; `plainLyrics` is lines of text.
 * Either is null when LRCLIB has none, and both are for an instrumental. `hasWordSync`,
 * `lyricsfile` and the rest are not read.
 */
import { z } from 'zod';

export const lrclibRecordSchema = z.object({
  id: z.number().int(),
  trackName: z.string(),
  artistName: z.string(),
  albumName: z.string().nullable(),
  /** Seconds. */
  duration: z.number(),
  instrumental: z.boolean(),
  plainLyrics: z.string().nullable(),
  syncedLyrics: z.string().nullable(),
});
export type LrclibRecord = z.infer<typeof lrclibRecordSchema>;
