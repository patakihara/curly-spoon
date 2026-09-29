/**
 * Zod schemas for the Audiobookshelf calls Auralis makes, cut to the fields it reads.
 * `.passthrough()` keeps the rest: ABS adds fields between versions, and a recording shows the
 * whole answer anyway. The shapes follow mediaserver's recordings in `recordings/` (ABS 2.36.1).
 */
import { HLS_SEGMENT } from '@auralis/schema';
import { z } from 'zod';

/** `GET /status`, unauthenticated. */
export const statusSchema = z.object({ serverVersion: z.string() }).passthrough();

/** ABS has two library media types; Auralis plays both. */
export const mediaTypeSchema = z.enum(['book', 'podcast']);

export const librarySchema = z
  .object({ id: z.string(), name: z.string(), mediaType: mediaTypeSchema })
  .passthrough();

/** `GET /api/libraries`. */
export const librariesSchema = z.object({ libraries: z.array(librarySchema) }).passthrough();

/**
 * `GET /api/libraries/:id/items?minified=1`: one page of a library, and how many items it holds
 * in all. Each item's `updatedAt` (ms) moves whenever ABS changes the item or its episodes, which
 * is what the index compares.
 */
export const libraryItemsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    results: z.array(
      z.object({ id: z.string(), mediaType: mediaTypeSchema, updatedAt: z.number() }).passthrough(),
    ),
  })
  .passthrough();

/**
 * What both clients play as a file. ABS direct-plays when every audio file's mime type is in the
 * request's `supportedMimeTypes`, and transcodes to HLS otherwise:
 * `PlaybackSessionManager` runs `forceDirectPlay || (!forceTranscode && checkCanDirectPlay(...))`.
 * An empty body fails that check, so ABS would transcode everything, starting an ffmpeg process
 * on the server. Never send an empty play body.
 */
export const SUPPORTED_MIME_TYPES = [
  'audio/flac',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/aac',
  'audio/webm',
] as const;

export interface PlayRequest {
  deviceInfo: { clientName: 'Auralis'; clientVersion: string; deviceId: string };
  mediaPlayer: 'html5';
  supportedMimeTypes: string[];
  /** Never forced: a file the clients cannot play is transcoded to HLS instead. */
  forceDirectPlay: false;
  /** Only record mode sets it, to record the HLS path on a book that would direct-play. */
  forceTranscode: boolean;
}

/**
 * A direct-play track carries its file's `metadata` and a `contentUrl` of
 * `/api/items/:id/file/:ino`; a transcoded session has one track, `contentUrl`
 * `/hls/:session/output.m3u8`, mime `application/vnd.apple.mpegurl` and no codec (both recorded).
 */
export const audioTrackSchema = z
  .object({
    contentUrl: z.string(),
    mimeType: z.string().optional(),
    /** Seconds; `startOffset` is where the track starts within the whole item. */
    duration: z.number().optional(),
    startOffset: z.number().optional(),
    metadata: z.object({}).passthrough().nullable().optional(),
  })
  .passthrough();

/**
 * `GET /api/items/:id?expanded=1`. A book's `media.tracks` are its audio files in play order,
 * the same tracks a direct-play session lists (recorded).
 */
export const itemSchema = z
  .object({
    id: z.string(),
    mediaType: mediaTypeSchema,
    media: z.object({ tracks: z.array(audioTrackSchema).optional() }).passthrough(),
  })
  .passthrough();

/** A book's chapter, in seconds from the start of the whole book, across its files (recorded). */
export const chapterSchema = z
  .object({ title: z.string(), start: z.number(), end: z.number() })
  .passthrough();

/**
 * `POST /api/items/:id/play`: the playback session. `playMethod` 0 is direct play, 2 a transcode
 * (both recorded).
 */
export const playSessionSchema = z
  .object({
    id: z.string(),
    playMethod: z.number(),
    audioTracks: z.array(audioTrackSchema),
    /** Seconds into the item where this person left off. */
    currentTime: z.number().optional(),
    chapters: z.array(chapterSchema).optional(),
  })
  .passthrough();

/** An item id or a file's inode number, as they sit in a path: nothing that could change it. */
export const itemIdSchema = z.string().regex(/^[\w-]{1,64}$/);
export const inoSchema = z.string().regex(/^\d{1,20}$/);

/** One audio file of an item: what `GET /api/items/:id/file/:ino` serves. */
export interface FileRef {
  itemId: string;
  ino: string;
}

/**
 * The headers of `GET /api/items/:id/file/:ino`, recorded as a 206 to `Range: bytes=0-1`:
 * ABS sets the audio type from the file's extension and serves ranges.
 */
export const fileHeadersSchema = z.object({
  'content-type': z.string().regex(/^audio\//i, 'an audio type'),
  'content-length': z.string().regex(/^\d+$/).optional(),
  'content-range': z
    .string()
    .regex(/^bytes (?:\d+-\d+|\*)\/(?:\d+|\*)$/)
    .optional(),
  'accept-ranges': z.string().optional(),
});
export type FileHeaders = z.infer<typeof fileHeadersSchema>;

/** The largest playlist read: a 6 s segment is about 30 bytes of it, so this is ~800 hours. */
export const MAX_PLAYLIST_BYTES = 4_000_000;
/** A segment URI as ABS writes it; some versions append the upstream token as a query. */
const SEGMENT_URI = new RegExp(`^(${HLS_SEGMENT.source})(?:\\?[^\\s"]*)?$`);
const MAP_URI = /URI="([^"]*)"/;

/**
 * `GET /hls/:session/output.m3u8` (recorded): a VOD media playlist of relative segment names.
 * Parsed to the same playlist with every URI cut to its bare segment name, so whatever query ABS
 * put on it (its token, in some versions) never reaches a client. Anything else fails. The
 * client reads at most `MAX_PLAYLIST_BYTES` of it.
 */
export const hlsPlaylistSchema = z.string().transform((text, ctx) => {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '#EXTM3U') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'not an HLS playlist' });
    return z.NEVER;
  }
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MAP:')) {
      const uri = MAP_URI.exec(line)?.[1] ?? '';
      const name = SEGMENT_URI.exec(uri)?.[1];
      if (name === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a map URI that is not init.mp4' });
        return z.NEVER;
      }
      out.push(line.replace(MAP_URI, `URI="${name}"`));
    } else if (line === '' || line.startsWith('#')) {
      out.push(line);
    } else {
      const name = SEGMENT_URI.exec(line)?.[1];
      if (name === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'a URI that is not a segment' });
        return z.NEVER;
      }
      out.push(name);
    }
  }
  return out.join('\n');
});

/**
 * The headers of `GET /hls/:session/<segment>` (recorded): ABS names an MPEG-TS segment
 * `video/mp2t` and an fMP4 one `video/iso.segment` or `video/mp4` by extension, though a
 * transcode holds only audio.
 */
export const hlsSegmentHeadersSchema = fileHeadersSchema.extend({
  'content-type': z
    .string()
    .regex(/^(?:video\/mp2t|video\/iso\.segment|video\/mp4|audio\/[\w.+-]+)(?:;.*)?$/i),
});

/** `POST /api/session/:id/close` answers a bare 200 (`OK` as text); nothing in it is read. */
export const closeSessionSchema = z.unknown();

const optionalString = z.string().nullable().optional();

/** A book's metadata as the item answer carries it: people and series come with their ids. */
const bookMetadataSchema = z.object({
  title: z.string(),
  authors: z.array(z.object({ id: z.string(), name: z.string() })),
  narrators: z.array(z.string()),
  series: z.array(z.object({ id: z.string(), name: z.string(), sequence: optionalString })),
  genres: z.array(z.string()),
  publishedYear: optionalString,
  isbn: optionalString,
  asin: optionalString,
});

/** One audio file of an item; a book's length is the sum of the files it plays. */
const audioFileSchema = z.object({
  duration: z.number().nullable().optional(),
  exclude: z.boolean().optional(),
});

/**
 * An episode as a show's item answer lists it. Each carries its own `updatedAt`, which moves
 * when ABS edits the episode even though the show's `updatedAt` does not (recorded: episodes
 * edited in September inside a show last updated in August). `guid` is null for episodes ABS
 * matched without one.
 */
const episodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  season: optionalString,
  episode: optionalString,
  guid: optionalString,
  enclosure: z.object({ url: z.string() }).nullable().optional(),
  publishedAt: z.number().nullable().optional(),
  updatedAt: z.number(),
  audioFile: audioFileSchema.nullable().optional(),
});

const itemBase = { id: z.string(), libraryId: z.string(), updatedAt: z.number() };

/**
 * `GET /api/items/:id`, not expanded: what the index reads of a book or a show, and nothing else.
 * zod strips every other field, so a 2,000-episode show parses to little more than its rows.
 * The shapes follow the index recordings (`index-book-*`, `index-show-*`).
 */
export const itemSummarySchema = z.discriminatedUnion('mediaType', [
  z.object({
    ...itemBase,
    mediaType: z.literal('book'),
    media: z.object({ metadata: bookMetadataSchema, audioFiles: z.array(audioFileSchema) }),
  }),
  z.object({
    ...itemBase,
    mediaType: z.literal('podcast'),
    media: z.object({
      metadata: z.object({
        title: z.string(),
        author: optionalString,
        genres: z.array(z.string()),
        feedUrl: optionalString,
        itunesId: optionalString,
      }),
      episodes: z.array(episodeSchema),
    }),
  }),
]);
export type ItemSummary = z.infer<typeof itemSummarySchema>;
export type BookSummary = Extract<ItemSummary, { mediaType: 'book' }>;
export type ShowSummary = Extract<ItemSummary, { mediaType: 'podcast' }>;
