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
 * playing, never what plays it: the plan, the report or the close they come with never waits for
 * Jellyfin's answer, and one Jellyfin does not take is logged.
 */
import {
  type ArtUrl,
  type MediaRef,
  type PlaybackMeta,
  type PlaybackPlan,
  type PlaybackTrack,
} from '@auralis/schema';
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

/** Names joined into one line; null when there are none. */
const line = (names: readonly string[] | null | undefined): string | null =>
  names !== null && names !== undefined && names.length > 0 ? names.join(', ') : null;

/**
 * What a track or an album is, as Jellyfin names it: a track by its title and artists, with its
 * album's art; an album by its title and album artist, with its own. `artOf` says where this
 * server serves an album's art, if it does.
 */
function jellyfinMeta(item: PlayableItem, artOf: (ref: MediaRef) => ArtUrl | null): PlaybackMeta {
  const albumArtist = item.AlbumArtist ?? null;
  const track = item.Type === 'Audio';
  const albumId = track ? item.AlbumId : item.Id;
  return {
    title: item.Name ?? '',
    sub: track ? (line(item.Artists) ?? albumArtist) : (albumArtist ?? line(item.Artists)),
    art:
      albumId === null || albumId === undefined ? null : artOf({ source: 'jellyfin', id: albumId }),
    variant: 'music',
  };
}

/**
 * How to play a track or an album, short of the play it reports to, with the tracks it plays by
 * their Jellyfin ids. Each track carries its own title, and its artists where they differ from
 * the plan's, so an album's plan names the song playing while its meta names the album; or a refusal: 404 for what is not music or an album with no tracks, 422
 * `unsupported_format` for a file the clients do not play.
 */
export async function planJellyfin(
  jellyfin: JellyfinClient,
  item: PlayableItem,
  artOf: (ref: MediaRef) => ArtUrl | null,
): Promise<JellyfinPlan> {
  if (item.Type !== 'Audio' && item.Type !== 'MusicAlbum') throw new Refusal(404, 'not_found');
  const files =
    item.Type === 'Audio' ? [item] : inAlbumOrder(await jellyfin.getAlbumPlayables(item.Id));

  const meta = jellyfinMeta(item, artOf);
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
    const sub = line(file.Artists) ?? file.AlbumArtist ?? null;
    tracks.push({
      url: jellyfinTrackUrl(file.Id),
      mime,
      duration,
      offset,
      title: file.Name ?? '',
      ...(sub === null || sub === meta.sub ? {} : { sub }),
    });
    played.push({ id: file.Id, offset, duration });
    offset += duration;
  }
  if (tracks.length === 0) throw new Refusal(404, 'not_found');
  return { plan: { meta, tracks, chapters: [], startAt: 0 }, played };
}

/** A plan of Jellyfin tracks, short of the play it reports to, with the tracks it plays by id. */
export interface JellyfinPlan {
  plan: Omit<PlaybackPlan, 'progressTarget'>;
  played: PlannedTrack[];
}

/**
 * The part of an album's plan that plays the tracks `ids`, in that order, from the start; null
 * when the album does not hold every one of them.
 */
export function planRun(album: JellyfinPlan, ids: readonly string[]): JellyfinPlan | null {
  const tracks: PlaybackTrack[] = [];
  const played: PlannedTrack[] = [];
  let offset = 0;
  for (const id of ids) {
    const at = album.played.findIndex((t) => t.id === id);
    const track = album.plan.tracks[at];
    if (track === undefined) return null;
    tracks.push({ ...track, offset });
    played.push({ id, offset, duration: track.duration });
    offset += track.duration;
  }
  return { plan: { ...album.plan, tracks, startAt: 0 }, played };
}

type ReportKind = 'playing' | 'progress' | 'stopped';

/** One report waiting to reach Jellyfin, for the play `playSessionId`. */
interface WaitingReport {
  playSessionId: string;
  kind: ReportKind;
  send: () => Promise<void>;
}

/** A device's reports to Jellyfin, from every play it makes: see `jellyfinLine`. */
export interface JellyfinLine {
  give: (report: WaitingReport) => void;
}

/**
 * The line a device's reports reach Jellyfin through: one at a time, in the order given, each
 * only once Jellyfin has answered the one before, so a play's start, progress and stop, and the
 * stop of a device's play before the start of its next, arrive in order. Giving a report never
 * waits for Jellyfin, so a slow Jellyfin never slows the player. While Jellyfin is slow, a play
 * keeps at most one progress report waiting: a newer one takes its place, since Jellyfin needs
 * only where the play is now. A start or a stop is never dropped. One Jellyfin does not take goes
 * to `log`, and the next goes ahead as if it had.
 */
export function jellyfinLine(log: FastifyBaseLogger): JellyfinLine {
  const waiting: WaitingReport[] = [];
  let sending = false;
  const drain = async () => {
    sending = true;
    for (let next = waiting.shift(); next !== undefined; next = waiting.shift()) {
      try {
        await next.send();
      } catch (error) {
        const { kind, playSessionId } = next;
        log.warn({ err: error, playSessionId }, `Jellyfin did not take a ${kind} report`);
      }
    }
    sending = false;
  };
  return {
    give: (report) => {
      if (report.kind === 'progress') {
        const last = waiting.findLastIndex((w) => w.playSessionId === report.playSessionId);
        if (waiting[last]?.kind === 'progress') {
          waiting[last] = report;
          return;
        }
      }
      waiting.push(report);
      if (!sending) void drain();
    },
  };
}

/**
 * A play's reports to Jellyfin, as the person whose client `jellyfin` is, under `playSessionId`,
 * through its device's `line`. A report whose position falls in another track than the one playing
 * stops that one where the last report left it and starts the new one. Each is worked out from
 * where the one given before left the play, and given to the line without waiting for Jellyfin.
 */
export function jellyfinReports(
  jellyfin: JellyfinClient,
  played: readonly PlannedTrack[],
  playSessionId: string,
  line: JellyfinLine,
) {
  const first = played[0];
  if (first === undefined) throw new Error('a plan has at least one track');
  /** The track a position falls in, and the position within it. */
  const at = (position: number) => {
    const track = played.findLast((t) => t.offset <= position) ?? first;
    return { track, within: Math.min(position - track.offset, track.duration) };
  };
  let playing = first;
  let within = 0;
  const tell = (kind: ReportKind, send: () => Promise<void>) =>
    line.give({ playSessionId, kind, send });
  const start = (paused: boolean) => {
    const report = { itemId: playing.id, position: within, paused, playSessionId };
    tell('playing', () => jellyfin.reportStart(report));
  };
  const stop = () => {
    const report = { itemId: playing.id, position: within, playSessionId };
    tell('stopped', () => jellyfin.reportStopped(report));
  };
  return {
    /** Tells Jellyfin the first track started, at its start. */
    start: () => start(false),
    report: ({ position, paused }: UpstreamReport) => {
      const now = at(position);
      if (now.track !== playing) {
        stop();
        playing = now.track;
        within = now.within;
        start(paused);
        return;
      }
      within = now.within;
      const report = { itemId: playing.id, position: within, paused, playSessionId };
      tell('progress', () => jellyfin.reportProgress(report));
    },
    /** Tells Jellyfin the track playing stopped: where `last` is, if it is in that track. */
    close: (last?: UpstreamReport) => {
      if (last !== undefined) {
        const now = at(last.position);
        if (now.track === playing) within = now.within;
      }
      stop();
    },
  };
}
