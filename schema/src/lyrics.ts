/**
 * A track's lyrics: synced lines timed in seconds, as playback positions are, plain lines untimed,
 * or none. Status and source are enums and the text is the upstream's own, so a client words
 * "No lyrics found" itself, apart from an error.
 */
import { MediaRef } from './play.js';
import { z } from './zod.js';

/** Synced lines, plain lines, an instrumental recording, or no lyrics anywhere. */
export const LyricsStatus = z
  .enum(['synced', 'plain', 'instrumental', 'none'])
  .openapi('LyricsStatus');
export type LyricsStatus = z.infer<typeof LyricsStatus>;

/** Where the lyrics came from: the household's own Jellyfin, or LRCLIB. */
export const LyricsSource = z.enum(['jellyfin', 'lrclib']).openapi('LyricsSource');
export type LyricsSource = z.infer<typeof LyricsSource>;

/**
 * One line: when it is sung, in seconds from the track's start, null exactly when the lyrics are
 * plain; and its text, empty for an instrumental break.
 */
export const LyricLine = z
  .object({ start: z.number().finite().nonnegative().nullable(), text: z.string() })
  .openapi('LyricLine');
export type LyricLine = z.infer<typeof LyricLine>;

/** A track's lyrics; `source` is null and `lines` empty exactly when status is none. */
export const Lyrics = z
  .object({
    ref: MediaRef,
    status: LyricsStatus,
    source: LyricsSource.nullable(),
    lines: z.array(LyricLine),
  })
  .openapi('Lyrics');
export type Lyrics = z.infer<typeof Lyrics>;
