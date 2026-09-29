/**
 * Playback: what to play in, a plan to play it by out. An Audiobookshelf item plays by direct
 * play, one track per file, or, when a file is a type the clients do not play, as one HLS
 * transcode. M1.progress and the queues fill the progress target and what comes next in place.
 */
import { z } from './zod.js';

/** Where an item lives upstream. */
export const MediaSource = z.enum(['abs']).openapi('MediaSource');
export type MediaSource = z.infer<typeof MediaSource>;

/** An upstream id as it sits in a path: nothing that could change the path it is put in. */
const UpstreamId = z.string().regex(/^[\w-]{1,64}$/);

/** One playable item: which upstream, and its id there. */
export const MediaRef = z.object({ source: MediaSource, id: UpstreamId }).openapi('MediaRef');
export type MediaRef = z.infer<typeof MediaRef>;

export const PlayBody = z.object({ ref: MediaRef }).openapi('PlayBody');
export type PlayBody = z.infer<typeof PlayBody>;

/**
 * A ref as it sits in a path, `<source>:<id>`: `abs:6d9c…`. The server maps it back to the
 * upstream item; nothing a client puts here reaches an upstream path unchecked.
 */
export const MediaRefKey = z.string().regex(/^abs:[\w-]{1,64}$/);
export type MediaRefKey = z.infer<typeof MediaRefKey>;

export function mediaRefKey(ref: MediaRef): MediaRefKey {
  return `${ref.source}:${ref.id}`;
}

/** The ref a key names, or null for anything that is not one. */
export function parseMediaRefKey(key: string): MediaRef | null {
  if (!MediaRefKey.safeParse(key).success) return null;
  const at = key.indexOf(':');
  return MediaRef.parse({ source: key.slice(0, at), id: key.slice(at + 1) });
}

/** The mime type of a transcode's one track: an HLS playlist, played with hls.js or Media3's HLS. */
export const HLS_MIME = 'application/vnd.apple.mpegurl';

/** One audio file to play, streamed through this server. Times are in seconds. */
export const PlaybackTrack = z
  .object({
    /**
     * `/api/media/{ref}/tracks/{n}`, or for a transcode `/api/media/{ref}/hls/{playId}/output.m3u8`,
     * sent with the same session or bearer token.
     */
    url: z.string().startsWith('/api/'),
    /** The file's audio type, or `application/vnd.apple.mpegurl` for a transcode. */
    mime: z.string(),
    duration: z.number().nonnegative(),
    /** Where the track starts within the whole item. */
    offset: z.number().nonnegative(),
  })
  .openapi('PlaybackTrack');
export type PlaybackTrack = z.infer<typeof PlaybackTrack>;

/**
 * A named span of the whole item, in seconds from its start, across files: a chapter in the
 * second file starts after the whole first file. A track's `offset` finds the file it falls in.
 */
export const PlaybackChapter = z
  .object({
    title: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .openapi('PlaybackChapter');
export type PlaybackChapter = z.infer<typeof PlaybackChapter>;

/** An open playback session's id, as it sits in a path. */
const PlayId = z.string().regex(/^[\w-]{1,64}$/);

/**
 * Where the player reports its position while this plan plays: the open playback session. A
 * transcode lives in it, so the player closes it (`POST /api/play/{playId}/close`) when done.
 */
export const ProgressTarget = z.object({ playId: PlayId }).openapi('ProgressTarget');
export type ProgressTarget = z.infer<typeof ProgressTarget>;

/**
 * How to play an item: its tracks in order, its chapters, where in the item to start, where to
 * report progress, and what plays next. Direct play closes its session at once, so it has no
 * progress target until M1.progress; a transcode keeps its session open and names it. Nothing
 * plays next until the queues do.
 */
export const PlaybackPlan = z
  .object({
    tracks: z.array(PlaybackTrack).min(1),
    chapters: z.array(PlaybackChapter),
    startAt: z.number().nonnegative(),
    progressTarget: ProgressTarget.optional(),
    /** What plays when this item ends; absent, playback stops. */
    next: MediaRef.optional(),
  })
  .openapi('PlaybackPlan');
export type PlaybackPlan = z.infer<typeof PlaybackPlan>;

/** One track of an item, by the item's ref and the track's index in its plan, from 0. */
export const MediaTrackParams = z.object({
  ref: MediaRefKey,
  n: z.string().regex(/^(?:0|[1-9]\d{0,3})$/),
});
export type MediaTrackParams = z.infer<typeof MediaTrackParams>;

/** One open playback session, by its id. */
export const PlayParams = z.object({ playId: PlayId });
export type PlayParams = z.infer<typeof PlayParams>;

/**
 * A transcode's segment as Audiobookshelf names it: an MPEG-TS or fMP4 segment, or the fMP4 init.
 * The server reads playlists by it too, so the names a client is given and may ask for are one.
 */
export const HLS_SEGMENT = /output-\d{1,6}\.(?:ts|m4s)|init\.mp4/;

/**
 * One file of a transcode: its playlist, `output.m3u8`, or a segment it names. The playlist's
 * segment names are relative, so they resolve under the same route.
 */
export const MediaHlsParams = z.object({
  ref: MediaRefKey,
  playId: PlayId,
  file: z.string().regex(new RegExp(`^(?:output\\.m3u8|${HLS_SEGMENT.source})$`)),
});
export type MediaHlsParams = z.infer<typeof MediaHlsParams>;

/** The audio bytes a streamed route answers. */
export const AudioBytes = z.string().openapi({ format: 'binary' });
