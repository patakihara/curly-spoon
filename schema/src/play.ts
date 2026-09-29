/**
 * Playback: what to play in, a plan to play it by out. M0 plays one Audiobookshelf item by direct
 * play; M1.play grows the plan (chapters, a progress target, what comes next, HLS) and the ref
 * (Jellyfin) in place.
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

/** One audio file to play, streamed through this server. Times are in seconds. */
export const PlaybackTrack = z
  .object({
    /** `/api/media/{ref}/tracks/{n}`, sent with the same session or bearer token. */
    url: z.string().startsWith('/api/'),
    mime: z.string(),
    duration: z.number().nonnegative(),
    /** Where the track starts within the whole item. */
    offset: z.number().nonnegative(),
  })
  .openapi('PlaybackTrack');
export type PlaybackTrack = z.infer<typeof PlaybackTrack>;

/** A named span of the whole item, in seconds from its start, across files. */
export const PlaybackChapter = z
  .object({
    title: z.string(),
    start: z.number().nonnegative(),
    end: z.number().nonnegative(),
  })
  .openapi('PlaybackChapter');
export type PlaybackChapter = z.infer<typeof PlaybackChapter>;

/** Where the player reports its position while this plan plays. */
export const ProgressTarget = z.object({ playId: z.string() }).openapi('ProgressTarget');
export type ProgressTarget = z.infer<typeof ProgressTarget>;

/**
 * How to play an item: its tracks in order, its chapters, where in the item to start, where to
 * report progress, and what plays next. M0 plays one direct-play track and leaves chapters empty,
 * with no progress target and nothing next; M1.play and M1.progress fill them in place.
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

/** The audio bytes a streamed route answers. */
export const AudioBytes = z.string().openapi({ format: 'binary' });
