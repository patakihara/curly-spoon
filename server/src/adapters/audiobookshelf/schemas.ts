/**
 * Zod schemas for the Audiobookshelf calls Auralis makes, cut to the fields it reads.
 * `.passthrough()` keeps the rest: ABS adds fields between versions, and a recording shows the
 * whole answer anyway. Tightened to what mediaserver's recordings show once they exist.
 */
import { z } from 'zod';

/** `GET /status`, unauthenticated. */
export const statusSchema = z.object({ serverVersion: z.string() }).passthrough();

export const librarySchema = z
  .object({ id: z.string(), name: z.string(), mediaType: z.string() })
  .passthrough();

/** `GET /api/libraries`. */
export const librariesSchema = z.object({ libraries: z.array(librarySchema) }).passthrough();

/** `GET /api/libraries/:id/items`. */
export const libraryItemsSchema = z
  .object({ results: z.array(z.object({ id: z.string() }).passthrough()) })
  .passthrough();

/** `GET /api/items/:id?expanded=1`. */
export const itemSchema = z
  .object({ id: z.string(), mediaType: z.string(), media: z.object({}).passthrough() })
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

export const audioTrackSchema = z
  .object({
    contentUrl: z.string(),
    mimeType: z.string().optional(),
    metadata: z.object({}).passthrough().nullable().optional(),
  })
  .passthrough();

/** `POST /api/items/:id/play`: the playback session. `playMethod` 0 is direct play. */
export const playSessionSchema = z
  .object({ id: z.string(), playMethod: z.number(), audioTracks: z.array(audioTrackSchema) })
  .passthrough();

/** `POST /api/session/:id/close` answers a bare 200 (`OK` as text); nothing in it is read. */
export const closeSessionSchema = z.unknown();
