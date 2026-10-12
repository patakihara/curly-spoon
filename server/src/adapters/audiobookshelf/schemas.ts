/**
 * Zod schemas for the Audiobookshelf calls Auralis makes, cut to the fields it reads.
 * `.passthrough()` keeps the rest: ABS adds fields between versions, and a recording shows the
 * whole answer anyway. The shapes follow mediaserver's recordings in `recordings/` (ABS 2.36.1).
 */
import { HLS_SEGMENT } from '@auralis/schema';
import { z } from 'zod';
import { fileHeadersSchema } from '../stream.js';

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
 * `GET /api/items/:id?expanded=1` read for a book's page: its length in seconds, the sum of the
 * files it plays, and its chapters; its title and authors label a book the index no longer holds
 * (recorded).
 */
export const bookDetailSchema = z
  .object({
    media: z
      .object({
        metadata: z.object({
          title: z.string(),
          authors: z.array(z.object({ name: z.string() })).optional(),
        }),
        duration: z.number().nonnegative(),
        chapters: z.array(chapterSchema).optional(),
      })
      .passthrough(),
  })
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
    /** The item's length in seconds, which every sync reports back. */
    duration: z.number().optional(),
    chapters: z.array(chapterSchema).optional(),
    /** What plays, as ABS names it: a book's title, or an episode's own title. */
    displayTitle: z.string().nullable().optional(),
    /** A book's authors, or a show's author, as one line. */
    displayAuthor: z.string().nullable().optional(),
    /** The book's or the show's metadata: for an episode, its `title` is the show's. */
    mediaMetadata: z.object({ title: z.string().nullable().optional() }).passthrough().optional(),
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

/**
 * The body of `POST /api/session/:id/sync`, and of a close that reports last: where the person is,
 * the wall-clock seconds they listened since the last report, and the item's length. ABS adds
 * `timeListened` to their listening stats, so it is time spent playing, never a position delta.
 */
export interface SessionSync {
  currentTime: number;
  timeListened: number;
  duration: number;
}

/** `POST /api/session/:id/sync` answers a bare 200 (`OK` as text, recorded); nothing is read. */
export const syncSessionSchema = z.unknown();

/** One person's progress on one item: `GET /api/me/progress/:id`, and each of `GET /api/me`'s. */
export const mediaProgressSchema = z
  .object({
    id: z.string(),
    libraryItemId: z.string(),
    episodeId: z.string().nullable().optional(),
    duration: z.number(),
    progress: z.number(),
    currentTime: z.number(),
    isFinished: z.boolean(),
    /** When it last changed, in milliseconds since the epoch (recorded). */
    lastUpdate: z.number().optional(),
  })
  .passthrough();
export type MediaProgress = z.infer<typeof mediaProgressSchema>;

/** A bookmark: ABS keeps them per library item and tells them apart by `time`, in seconds. */
export const bookmarkSchema = z
  .object({
    libraryItemId: z.string(),
    time: z.number(),
    title: z.string(),
    createdAt: z.number(),
  })
  .passthrough();
export type AbsBookmark = z.infer<typeof bookmarkSchema>;

/**
 * `GET /api/me`: the key's own user, cut to who they are, their progress and their bookmarks. The
 * answer also carries the user's own token, which nothing here reads.
 */
export const meSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    mediaProgress: z.array(mediaProgressSchema),
    bookmarks: z.array(bookmarkSchema),
  })
  .passthrough();
export type AbsMe = z.infer<typeof meSchema>;

/**
 * Which libraries a person may open, from the same `GET /api/me`: every one when
 * `accessAllLibraries`, else those `librariesAccessible` names (recorded).
 */
export const libraryAccessSchema = z
  .object({
    permissions: z.object({ accessAllLibraries: z.boolean() }).passthrough(),
    librariesAccessible: z.array(z.string()),
  })
  .passthrough();
export type LibraryAccess = z.infer<typeof libraryAccessSchema>;

/**
 * `DELETE /api/me/item/:id/bookmark/:time` answers a bare 200 (`OK` as text), and 404 `Not Found`
 * when the item has no bookmark at that time (both recorded); nothing in it is read.
 */
export const deleteBookmarkSchema = z.unknown();

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

/**
 * One audio file of an item; a book's length is the sum of the files it plays. `ino` names the
 * file an episode streams from, under its show (recorded).
 */
const audioFileSchema = z.object({
  ino: inoSchema.optional(),
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
 * The shapes follow the index recordings (`index-book-*`, `index-show-*`). `coverPath` is null
 * or missing for an item with no cover.
 */
export const itemSummarySchema = z.discriminatedUnion('mediaType', [
  z.object({
    ...itemBase,
    mediaType: z.literal('book'),
    media: z.object({
      metadata: bookMetadataSchema,
      audioFiles: z.array(audioFileSchema),
      coverPath: optionalString,
    }),
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
      coverPath: optionalString,
    }),
  }),
]);
export type ItemSummary = z.infer<typeof itemSummarySchema>;
export type BookSummary = Extract<ItemSummary, { mediaType: 'book' }>;
export type ShowSummary = Extract<ItemSummary, { mediaType: 'podcast' }>;
