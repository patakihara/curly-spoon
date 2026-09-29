/**
 * Zod schemas for the Audiobookshelf calls Auralis makes, cut to the fields it reads.
 * `.passthrough()` keeps the rest: ABS adds fields between versions, and a recording shows the
 * whole answer anyway. The shapes follow mediaserver's recordings in `recordings/` (ABS 2.36.1).
 */
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

/** `GET /api/libraries/:id/items`. */
export const libraryItemsSchema = z
  .object({ results: z.array(z.object({ id: z.string() }).passthrough()) })
  .passthrough();

/**
 * What Auralis can play in a browser. ABS direct-plays only when every audio file's mime type is
 * in the request's `supportedMimeTypes` (or `forceDirectPlay` is set):
 * `PlaybackSessionManager` runs `forceDirectPlay || checkCanDirectPlay(supportedMimeTypes)`.
 * An empty body fails that check, so ABS transcodes and answers one HLS track with
 * `metadata: null`, starting an ffmpeg process on the server. Never send an empty play body.
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
  forceDirectPlay: true;
}

/**
 * A direct-play track carries its file's `metadata` and a `contentUrl` of
 * `/api/items/:id/file/:ino` (recorded); a transcoded HLS track has `metadata: null` (not
 * recorded, since recording it would start a transcode on mediaserver).
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

/**
 * `POST /api/items/:id/play`: the playback session. `playMethod` 0 is direct play, which the
 * recording shows for the direct-play body.
 */
export const playSessionSchema = z
  .object({
    id: z.string(),
    playMethod: z.number(),
    audioTracks: z.array(audioTrackSchema),
    /** Seconds into the item where this person left off. */
    currentTime: z.number().optional(),
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

/** `POST /api/session/:id/close` answers a bare 200 (`OK` as text); nothing in it is read. */
export const closeSessionSchema = z.unknown();
