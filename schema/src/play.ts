/**
 * Playback: what to play in, a plan to play it by out. An Audiobookshelf item plays by direct
 * play, one track per file, or, when a file is a type the clients do not play, as one HLS
 * transcode. A Jellyfin track plays its own file, and an album its tracks in order, never
 * transcoded. Every plan names its open playback session, where the player reports progress and
 * which it closes when done. The queues fill what comes next in place.
 */
import { z } from './zod.js';

/** Where an item lives upstream. */
export const MediaSource = z.enum(['abs', 'jellyfin']).openapi('MediaSource');
export type MediaSource = z.infer<typeof MediaSource>;

/** An upstream id as it sits in a path: nothing that could change the path it is put in. */
const UpstreamId = z.string().regex(/^[\w-]{1,64}$/);

/** One playable item: which upstream, and its id there. */
export const MediaRef = z.object({ source: MediaSource, id: UpstreamId }).openapi('MediaRef');
export type MediaRef = z.infer<typeof MediaRef>;

export const PlayBody = z.object({ ref: MediaRef }).openapi('PlayBody');
export type PlayBody = z.infer<typeof PlayBody>;

/**
 * A ref as it sits in a path, `<source>:<id>`: `abs:6d9c…`, or `jellyfin:` and Jellyfin's 32 hex
 * digits. The server maps it back to the upstream item; nothing a client puts here reaches an
 * upstream path unchecked.
 */
export const MediaRefKey = z.string().regex(/^(?:abs:[\w-]{1,64}|jellyfin:[0-9a-f]{32})$/);
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

/** [HLS_MIME] as a constant both generated clients carry, so neither copies the string. */
export const HlsMime = z.literal(HLS_MIME).openapi('HlsMime', {
  description: "The mime type of a transcode's one track: an HLS playlist.",
});

/** One audio file to play, streamed through this server. Times are in seconds. */
export const PlaybackTrack = z
  .object({
    /**
     * `/api/media/{ref}/tracks/{n}`, or for a transcode `/api/media/{ref}/hls/{playId}/output.m3u8`,
     * sent with the same session or bearer token. A Jellyfin track is its own ref's track 0, in an
     * album's plan too.
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
 * Where the player reports its position while this plan plays: the open playback session
 * (`POST /api/progress`). It closes it (`POST /api/play/{playId}/close`) when done with the plan.
 */
export const ProgressTarget = z.object({ playId: PlayId }).openapi('ProgressTarget');
export type ProgressTarget = z.infer<typeof ProgressTarget>;

/**
 * Where the person is in the whole item, and how long they listened. `seq` numbers the reports on
 * one play in the order the player made them, from 0: one no newer than a report already taken,
 * late or repeated, is dropped, so it never moves the position back or counts listening twice.
 * `listened` is wall-clock seconds spent playing since the last report the server acknowledged,
 * never a position delta, so a seek or a skip never counts as listening. `paused` says whether
 * playback is paused now. Jellyfin takes no listening time and keeps no resume point for music:
 * it times the play itself from the start, reports and stop it is sent, leaving out paused time.
 */
export const ProgressReport = z
  .object({
    seq: z.number().int().nonnegative(),
    position: z.number().nonnegative(),
    listened: z.number().nonnegative(),
    paused: z.boolean(),
  })
  .openapi('ProgressReport');
export type ProgressReport = z.infer<typeof ProgressReport>;

/**
 * One progress report for an open playback session. A session this device does not hold, closed,
 * gone idle or forgotten by a restart, answers 404: the player plans again and reports there.
 */
export const ProgressBody = z
  .object({ playId: PlayId, ...ProgressReport.shape })
  .openapi('ProgressBody');
export type ProgressBody = z.infer<typeof ProgressBody>;

/**
 * What became of a progress report: whether it was taken, and the number of the newest report
 * taken on the play. One not taken was no newer than that one, so a player that numbered its
 * reports from 0 again carries on from `lastSeq + 1`.
 */
export const ProgressAnswer = z
  .object({
    taken: z.boolean(),
    lastSeq: z.number().int().nonnegative(),
    /**
     * Where in the plan's item, in seconds from its start, the play must stop instead of playing
     * on: set when what the session plays next lies outside this plan, as after Play next in the
     * middle of a book or an album. The player pauses there and never starts the next file. A
     * report already past the cut is answered with its own position: the player stops now.
     */
    endAt: z.number().nonnegative().optional(),
  })
  .openapi('ProgressAnswer');
export type ProgressAnswer = z.infer<typeof ProgressAnswer>;

/** An item's art, served by this server: `/api/media/{ref}/art`. */
export const ArtUrl = z.string().startsWith('/api/');
export type ArtUrl = z.infer<typeof ArtUrl>;

/** How a plan plays: music, or spoken (a book or an episode), with speed and the sleep timer. */
export const PlaybackVariant = z.enum(['music', 'spoken']).openapi('PlaybackVariant');
export type PlaybackVariant = z.infer<typeof PlaybackVariant>;

/**
 * What a plan plays, as the player and the system's media controls name it: its title, its
 * artist, author or show (`sub`), its art, and whether it is music or spoken.
 */
export const PlaybackMeta = z
  .object({
    title: z.string(),
    sub: z.string().nullable(),
    art: ArtUrl.nullable(),
    variant: PlaybackVariant,
  })
  .openapi('PlaybackMeta');
export type PlaybackMeta = z.infer<typeof PlaybackMeta>;

/**
 * How to play an item: what it is, its tracks in order, its chapters, where in the item to start,
 * where to report progress, and what plays next.
 */
export const PlaybackPlan = z
  .object({
    meta: PlaybackMeta,
    tracks: z.array(PlaybackTrack).min(1),
    chapters: z.array(PlaybackChapter),
    startAt: z.number().nonnegative(),
    progressTarget: ProgressTarget,
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
