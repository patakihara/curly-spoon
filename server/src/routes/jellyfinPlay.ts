/**
 * Playing Jellyfin music, as the signed-in person with their own token, so Jellyfin answers only
 * what they can see. A track plans as one track; an album as one plan of its tracks in disc and
 * track order, back to back, so the players run it gapless like a multi-file book. Each track's
 * URL names the track itself, `/api/media/jellyfin:<track>/tracks/0`, and streams its own file
 * through the range proxy, never transcoded: a format the clients do not play is refused.
 *
 * Jellyfin hears of the play as the person: a start when it is planned, progress with each
 * report, and a stop when it closes or goes idle, each naming the track the position falls in and
 * the position within it. Jellyfin takes no listening time: it times the play itself, leaving out
 * the time it is told the track was paused. It counts a music track played at its start and keeps
 * no resume point for it (recorded), so a plan always starts at 0. The reports are a side effect of
 * playing, never what plays it: one Jellyfin does not take is logged, and the play, the report or
 * the close it came with goes ahead.
 */
import { type PlaybackPlan, type PlaybackTrack } from '@auralis/schema';
import { type FastifyBaseLogger } from 'fastify';
import { type JellyfinClient } from '../adapters/jellyfin/client.js';
import { type UpstreamReport } from './openPlays.js';
import { type PlayableItem } from '../adapters/jellyfin/schemas.js';
import type { SUPPORTED_MIME_TYPES } from '../adapters/audiobookshelf/schemas.js';
import { Refusal } from '../route.js';

type Mime = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Jellyfin's container names for the formats the clients play: the mime type each plays as, and
 * the audio codecs (Jellyfin's names) the clients play inside it. ALAC in an m4a, say, is not.
 */
const FORMAT_OF_CONTAINER: Readonly<Record<string, { mime: Mime; codecs: readonly string[] }>> = {
  flac: { mime: 'audio/flac', codecs: ['flac'] },
  mp3: { mime: 'audio/mpeg', codecs: ['mp3'] },
  m4a: { mime: 'audio/mp4', codecs: ['aac'] },
  m4b: { mime: 'audio/mp4', codecs: ['aac'] },
  mp4: { mime: 'audio/mp4', codecs: ['aac'] },
  mov: { mime: 'audio/mp4', codecs: ['aac'] },
  aac: { mime: 'audio/aac', codecs: ['aac'] },
  ogg: { mime: 'audio/ogg', codecs: ['vorbis', 'opus'] },
  oga: { mime: 'audio/ogg', codecs: ['vorbis', 'opus'] },
  opus: { mime: 'audio/ogg', codecs: ['opus'] },
  webm: { mime: 'audio/webm', codecs: ['opus', 'vorbis'] },
  webma: { mime: 'audio/webm', codecs: ['opus', 'vorbis'] },
};

/**
 * The mime type a track's file plays as, or null when the clients do not play it: its container
 * and its audio stream's codec must both be ones they play. An unnamed codec is not played.
 */
function mimeOf(item: Pick<PlayableItem, 'Container' | 'MediaStreams'>): Mime | null {
  const codec = item.MediaStreams?.find((s) => s.Type === 'Audio')?.Codec?.toLowerCase();
  if (codec === undefined) return null;
  for (const name of (item.Container ?? '').toLowerCase().split(',')) {
    const format = FORMAT_OF_CONTAINER[name.trim()];
    if (format?.codecs.includes(codec)) return format.mime;
  }
  return null;
}

/** The URL a Jellyfin track plays from, whichever plan it is in. */
export const jellyfinTrackUrl = (trackId: string) => `/api/media/jellyfin:${trackId}/tracks/0`;

/** Tracks in disc, then track order; a missing disc is the first, a missing number goes last. */
function inAlbumOrder(tracks: PlayableItem[]): PlayableItem[] {
  const disc = (t: PlayableItem) => t.ParentIndexNumber ?? 1;
  const number = (t: PlayableItem) => t.IndexNumber ?? Number.POSITIVE_INFINITY;
  return [...tracks].sort((a, b) => disc(a) - disc(b) || number(a) - number(b));
}

/** One track of a plan, by its Jellyfin id, where it sits in the plan. */
export interface PlannedTrack {
  id: string;
  offset: number;
  duration: number;
}

/**
 * How to play a track or an album, short of the play it reports to, with the tracks it plays by
 * their Jellyfin ids; or a refusal: 404 for what is not music or an album with no tracks, 422
 * `unsupported_format` for a file the clients do not play.
 */
export async function planJellyfin(
  jellyfin: JellyfinClient,
  item: PlayableItem,
): Promise<{ plan: Omit<PlaybackPlan, 'progressTarget'>; played: PlannedTrack[] }> {
  if (item.Type !== 'Audio' && item.Type !== 'MusicAlbum') throw new Refusal(404, 'not_found');
  const files =
    item.Type === 'Audio' ? [item] : inAlbumOrder(await jellyfin.getAlbumPlayables(item.Id));

  const tracks: PlaybackTrack[] = [];
  const played: PlannedTrack[] = [];
  let offset = 0;
  for (const file of files) {
    const ticks = file.RunTimeTicks;
    if (file.Type !== 'Audio' || ticks === null || ticks === undefined) {
      throw new Refusal(502, 'upstream_failed');
    }
    const mime = mimeOf(file);
    if (mime === null) throw new Refusal(422, 'unsupported_format');
    const duration = ticks / 1e7;
    tracks.push({ url: jellyfinTrackUrl(file.Id), mime, duration, offset });
    played.push({ id: file.Id, offset, duration });
    offset += duration;
  }
  if (tracks.length === 0) throw new Refusal(404, 'not_found');
  return { plan: { tracks, chapters: [], startAt: 0 }, played };
}

/**
 * A play's reports to Jellyfin, as the person whose client `jellyfin` is, under `playSessionId`.
 * A report whose position falls in another track than the one playing stops that one where the
 * last report left it and starts the new one. The start, the reports and the close reach Jellyfin
 * strictly in the order they are given, each only once the one before it is answered, so each
 * works from where the one before left the play. One Jellyfin does not take goes to `log`, and the
 * next goes ahead as if it had.
 */
export function jellyfinReports(
  jellyfin: JellyfinClient,
  played: readonly PlannedTrack[],
  playSessionId: string,
  log: FastifyBaseLogger,
) {
  const first = played[0];
  if (first === undefined) throw new Error('a plan has at least one track');
  /** The track a position falls in, and the position within it. */
  const at = (position: number) => {
    const track = played.findLast((t) => t.offset <= position) ?? first;
    return { track, within: Math.min(position - track.offset, track.duration) };
  };
  const tell = (kind: 'playing' | 'progress' | 'stopped', report: () => Promise<void>) =>
    report().catch((error: unknown) => {
      log.warn({ err: error, playSessionId }, `Jellyfin did not take a ${kind} report`);
    });
  let playing = first;
  let within = 0;
  /** The last step given, settled once Jellyfin has answered it; the next waits for it. */
  let queue: Promise<void> = Promise.resolve();
  const inTurn = (step: () => Promise<void>): Promise<void> => {
    const run = queue.then(step);
    queue = run.catch(() => undefined);
    return run;
  };
  const start = (paused: boolean) =>
    tell('playing', () =>
      jellyfin.reportStart({ itemId: playing.id, position: within, paused, playSessionId }),
    );
  const stop = () =>
    tell('stopped', () =>
      jellyfin.reportStopped({ itemId: playing.id, position: within, playSessionId }),
    );
  return {
    /** Tells Jellyfin the first track started, at its start. */
    start: () => inTurn(() => start(false)),
    report: ({ position, paused }: UpstreamReport) =>
      inTurn(async () => {
        const now = at(position);
        if (now.track !== playing) {
          await stop();
          playing = now.track;
          within = now.within;
          await start(paused);
          return;
        }
        within = now.within;
        await tell('progress', () =>
          jellyfin.reportProgress({ itemId: playing.id, position: within, paused, playSessionId }),
        );
      }),
    /** Tells Jellyfin the track playing stopped: where `last` is, if it is in that track. */
    close: (last?: UpstreamReport) =>
      inTurn(async () => {
        if (last !== undefined) {
          const now = at(last.position);
          if (now.track === playing) within = now.within;
        }
        await stop();
      }),
  };
}
