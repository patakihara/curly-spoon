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

/** One audio file to play, streamed through this server. Times are in seconds. */
export const PlaybackTrack = z
  .object({
    /** A path on this server, sent with the same session or bearer token. */
    url: z.string().startsWith('/api/'),
    mime: z.string(),
    duration: z.number().nonnegative(),
    /** Where the track starts within the whole item. */
    offset: z.number().nonnegative(),
  })
  .openapi('PlaybackTrack');
export type PlaybackTrack = z.infer<typeof PlaybackTrack>;

/** How to play an item: its tracks in order, and where in the item to start. */
export const PlaybackPlan = z
  .object({ tracks: z.array(PlaybackTrack).min(1), startAt: z.number().nonnegative() })
  .openapi('PlaybackPlan');
export type PlaybackPlan = z.infer<typeof PlaybackPlan>;

/** An Audiobookshelf item's file, by the item and the file's inode number. */
export const AbsStreamParams = z.object({
  itemId: UpstreamId,
  ino: z.string().regex(/^\d{1,20}$/),
});
export type AbsStreamParams = z.infer<typeof AbsStreamParams>;

/** The audio bytes a streamed route answers. */
export const AudioBytes = z.string().openapi({ format: 'binary' });
