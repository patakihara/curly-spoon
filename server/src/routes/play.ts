/**
 * Playing an item, as the signed-in person. A Jellyfin track or album plans and streams as
 * `jellyfinPlay.ts` says. For an Audiobookshelf item, `POST /api/play` opens an
 * Audiobookshelf session offering the types the clients play, and ABS chooses:
 * - direct play: one track per file at `/api/media/{ref}/tracks/{n}`, chapters at their absolute
 *   positions across files;
 * - a transcode: one HLS track at `/api/media/{ref}/hls/{playId}/output.m3u8`, the transcode
 *   living in the session.
 * Anything else ABS answers, such as a file in a type the clients do not play, is refused 422.
 * Every plan names the session it holds open as its progress target. `POST /api/progress` reports
 * to it: to ABS, a sync with the wall-clock time listened, as the person, never retried, since a
 * repeat counts the listening twice; to Jellyfin, as `jellyfinPlay.ts` says, where a report
 * Jellyfin does not take is logged and never fails the call. `POST /api/play/{playId}/close`
 * closes it, with a last report when given; so does planning again on the same device, or its
 * idle time running out.
 * The media routes pass a checked `Range` through with the person's own token and send the bytes
 * on as they come, never transcoded or buffered whole. Only the playlist is read whole, parsed,
 * and passed on with bare segment names that resolve under the same route.
 */
import { randomUUID } from 'node:crypto';
import {
  HLS_MIME,
  mediaHls,
  mediaRefKey,
  mediaTrack,
  parseMediaRefKey,
  closePlay,
  play,
  reportProgress,
  type PlaybackChapter,
  type PlaybackPlan,
  type PlaybackTrack,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { contentUrlParts, hlsSessionOf } from '../adapters/audiobookshelf/client.js';
import {
  type playSessionSchema,
  SUPPORTED_MIME_TYPES,
} from '../adapters/audiobookshelf/schemas.js';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { RangeNotSatisfiable, type UpstreamFile } from '../adapters/stream.js';
import { Refusal, serve, serveStream, type StreamAnswer } from '../route.js';
import type { Db } from '../store/connection.js';
import {
  type Linker,
  type UpstreamConfig,
  upstreamFor,
  type Upstreams,
} from '../upstream/links.js';
import { signedIn } from './auth.js';
import { jellyfinReports, planJellyfin } from './jellyfinPlay.js';
import { OpenPlays, type UpstreamReport } from './openPlays.js';
import { type z } from 'zod';

/** What the server needs to act upstream as a person: their tokens' key and the upstreams. */
export interface UpstreamAccess {
  key: Buffer;
  config: UpstreamConfig;
  fetch: FetchLike;
  linker?: Linker;
}

const CLIENT_VERSION = '0.0.0';

/** How the server holds plays open and waits for a transcode's segments. */
export interface PlaybackOptions {
  /** A transcode nothing has asked for in this long is closed. Default 10 minutes. */
  idleMs?: number;
  /**
   * A direct play or a Jellyfin play nothing has reported on in this long is closed. Default 60
   * minutes, so a long pause keeps its place; past it the player plans again.
   */
  directIdleMs?: number;
  /**
   * ABS answers 404 for a segment its transcode has not cut yet (recorded), and players give up
   * on a 404. The proxy asks again, this many times this far apart, before passing the 404 on,
   * and stops as soon as the client has gone. Default 20 tries 500 ms apart.
   */
  segmentWait?: { tries: number; everyMs: number };
}

const DEFAULT_IDLE_MS = 10 * 60_000;
const DEFAULT_DIRECT_IDLE_MS = 60 * 60_000;
const DEFAULT_SEGMENT_WAIT = { tries: 20, everyMs: 500 };
/** How often held plays are checked for idleness, besides on every playback request. */
const SWEEP_EVERY_MS = 60_000;

/** Waits `ms`, or less if `signal` aborts first. */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });

type AbsSession = z.infer<typeof playSessionSchema>;

/**
 * The item's chapters, at their absolute positions from the start of the whole item: ABS's
 * book-level chapters already are (recorded), so they are kept in order, cut to the item's length,
 * and dropped when nothing is left of them.
 */
export function planChapters(session: AbsSession, length: number): PlaybackChapter[] {
  return (session.chapters ?? [])
    .map(({ title, start, end }) => ({
      title,
      start: Math.min(Math.max(start, 0), length),
      end: Math.min(Math.max(end, 0), length),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * How to play what ABS answered, reporting to its session, or null when the clients cannot play
 * it: neither direct play of files in types they play, nor one transcode.
 */
function planFor(session: AbsSession, ref: string): PlaybackPlan | null {
  const startAt = session.currentTime ?? 0;
  const [first, ...rest] = session.audioTracks;
  const hls = first === undefined || rest.length > 0 ? null : hlsSessionOf(first.contentUrl);
  if (hls !== null && first?.duration !== undefined) {
    return {
      tracks: [
        {
          url: `/api/media/${ref}/hls/${hls}/output.m3u8`,
          mime: HLS_MIME,
          duration: first.duration,
          offset: 0,
        },
      ],
      chapters: planChapters(session, first.duration),
      startAt,
      progressTarget: { playId: hls },
    };
  }
  const tracks: PlaybackTrack[] = [];
  for (const [n, track] of session.audioTracks.entries()) {
    if (
      contentUrlParts(track.contentUrl) === null ||
      track.mimeType === undefined ||
      !(SUPPORTED_MIME_TYPES as readonly string[]).includes(track.mimeType) ||
      track.duration === undefined
    ) {
      return null;
    }
    tracks.push({
      url: `/api/media/${ref}/tracks/${n}`,
      mime: track.mimeType,
      duration: track.duration,
      offset: track.startOffset ?? 0,
    });
  }
  if (tracks.length === 0) return null;
  const last = tracks[tracks.length - 1]!;
  const length = last.offset + last.duration;
  return {
    tracks,
    chapters: planChapters(session, length),
    startAt,
    progressTarget: { playId: session.id },
  };
}

/** An upstream answer as this route's: its status, its headers with values, and its body. */
function passOn(opened: UpstreamFile, contentType?: string): StreamAnswer {
  const headers = Object.fromEntries(
    Object.entries(opened.headers).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  if (contentType !== undefined) headers['content-type'] = contentType;
  return { status: opened.status, headers, body: opened.body };
}

/**
 * An upstream failure as this server's answer: a missing item stays that, and a range past the
 * end stays that too, naming the file's size as the upstream did.
 */
export function refusalFor(error: unknown): never {
  if (error instanceof AdapterError) {
    if (error.status === 404) throw new Refusal(404, 'not_found');
    if (error.status === 416) {
      const size = error instanceof RangeNotSatisfiable ? error.size : undefined;
      const headers: Record<string, string> =
        size === undefined ? {} : { 'content-range': `bytes */${size}` };
      throw new Refusal(416, 'range_not_satisfiable', headers);
    }
    throw new Refusal(502, 'upstream_failed');
  }
  throw error;
}

export function playRoutes(
  app: FastifyInstance,
  options: {
    db: Db;
    upstreams: UpstreamAccess | null;
    playback?: PlaybackOptions;
    now?: () => number;
  },
): void {
  const { db, upstreams } = options;
  const segmentWait = options.playback?.segmentWait ?? DEFAULT_SEGMENT_WAIT;
  const transcodeIdleMs = options.playback?.idleMs ?? DEFAULT_IDLE_MS;
  const directIdleMs = options.playback?.directIdleMs ?? DEFAULT_DIRECT_IDLE_MS;
  const open = new OpenPlays({ now: options.now ?? Date.now });
  const sweeper = setInterval(() => void open.sweep(), SWEEP_EVERY_MS);
  sweeper.unref();
  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    await open.closeAll();
  });

  /** The caller's own upstream client for `source`, after closing any play gone idle. */
  const personFor = async <S extends keyof Upstreams>(
    request: FastifyRequest,
    source: S,
  ): Promise<{ client: NonNullable<Upstreams[S]>; userId: string; deviceId: string }> => {
    await open.sweep();
    const user = signedIn(request);
    const client = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user)[source];
    if (client === null) throw new Refusal(409, 'not_linked');
    return {
      client: client as NonNullable<Upstreams[S]>,
      userId: user.id,
      deviceId: user.deviceId,
    };
  };
  const absFor = async (request: FastifyRequest) => {
    const { client, ...owner } = await personFor(request, 'abs');
    return { abs: client, ...owner };
  };

  serve(app, play, async (request, _reply, body) => {
    const ref = mediaRefKey(body.ref);
    if (body.ref.source === 'jellyfin') {
      if (parseMediaRefKey(ref) === null) throw new Refusal(400, 'bad_request');
      const { client, userId, deviceId } = await personFor(request, 'jellyfin');
      const item = await client.getPlayable(body.ref.id).catch(refusalFor);
      const { plan, played } = await planJellyfin(client, item).catch(refusalFor);
      // Jellyfin's own play session ids are 32 hex digits (recorded).
      const playId = randomUUID().replace(/-/g, '');
      const reports = jellyfinReports(client, played, playId, app.log);
      // The device's track before stops before Jellyfin hears this one started.
      await open.closeDevice(userId, deviceId);
      await reports.start();
      const last = plan.tracks[plan.tracks.length - 1]!;
      await open.open({
        playId,
        userId,
        deviceId,
        ref,
        duration: last.offset + last.duration,
        idleMs: directIdleMs,
        report: (report) => reports.report(report),
        close: (report) => reports.close(report),
      });
      return { ...plan, progressTarget: { playId } };
    }
    const { abs, userId, deviceId } = await absFor(request);
    const session = await abs
      .play(body.ref.id, { deviceId, clientVersion: CLIENT_VERSION })
      .catch(refusalFor);
    const plan = planFor(session, ref);
    if (plan === null) {
      // A failed close loses nothing.
      await abs.closeSession(session.id).catch(() => undefined);
      await open.closeDevice(userId, deviceId);
      throw new Refusal(422, 'unsupported_format');
    }
    const playId = plan.progressTarget.playId;
    const last = plan.tracks[plan.tracks.length - 1]!;
    const duration = session.duration ?? last.offset + last.duration;
    const sync = ({ position, listened }: UpstreamReport) => ({
      currentTime: position,
      timeListened: listened,
      duration,
    });
    await open.open({
      playId,
      userId,
      deviceId,
      ref,
      duration,
      idleMs: plan.tracks[0]?.mime === HLS_MIME ? transcodeIdleMs : directIdleMs,
      report: (report) => abs.syncSession(playId, sync(report)),
      close: (report) => abs.closeSession(playId, report && sync(report)),
    });
    return plan;
  });

  serve(app, reportProgress, async (request, _reply, body) => {
    await open.sweep();
    const { id: userId, deviceId } = signedIn(request);
    const { playId, ...report } = body;
    const answer = await open.report(playId, { userId, deviceId }, report).catch(refusalFor);
    if (answer === null) throw new Refusal(404, 'not_found');
    return answer;
  });

  serve(app, closePlay, async (request, _reply, body, { params }) => {
    await open.sweep();
    const { id: userId, deviceId } = signedIn(request);
    const closed = await open.finish(params.playId, { userId, deviceId }, body).catch(refusalFor);
    if (!closed) throw new Refusal(404, 'not_found');
    return { ok: true };
  });

  serveStream(app, mediaTrack, async (request, { params, range }) => {
    const ref = parseMediaRefKey(params.ref);
    if (ref === null) throw new Refusal(400, 'bad_request');
    if (ref.source === 'jellyfin') {
      // A Jellyfin track is its own ref's only track. Jellyfin streams to anyone with the id, so
      // the person's own lookup decides whether they may have it.
      if (params.n !== '0') throw new Refusal(404, 'not_found');
      const { client } = await personFor(request, 'jellyfin');
      const item = await client.getPlayable(ref.id).catch(refusalFor);
      if (item.Type !== 'Audio') throw new Refusal(404, 'not_found');
      return passOn(await client.openAudio(ref.id, range).catch(refusalFor));
    }
    const { abs } = await absFor(request);
    const item = await abs.getItem(ref.id).catch(refusalFor);
    const track = item.media.tracks?.[Number(params.n)];
    const file = track === undefined ? null : contentUrlParts(track.contentUrl);
    if (file === null) throw new Refusal(404, 'not_found');
    return passOn(await abs.openFile(file, range).catch(refusalFor));
  });

  serveStream(app, mediaHls, async (request, { params, range, signal }) => {
    if (parseMediaRefKey(params.ref) === null) throw new Refusal(400, 'bad_request');
    const { abs, userId, deviceId } = await absFor(request);
    // ABS's HLS route checks no owner: only the device that planned a transcode may reach it.
    if (open.touch(params.playId, { userId, deviceId, ref: params.ref }) === null) {
      throw new Refusal(404, 'not_found');
    }
    if (params.file === 'output.m3u8') {
      const playlist = await abs.getHlsPlaylist(params.playId).catch(refusalFor);
      const bytes = new TextEncoder().encode(playlist);
      return {
        status: 200,
        headers: { 'content-type': HLS_MIME, 'content-length': String(bytes.byteLength) },
        body: new Blob([bytes]).stream(),
      };
    }
    for (let tries = 1; ; tries += 1) {
      try {
        const opened = await abs.openHlsSegment(params.playId, params.file, range);
        // ABS labels an MPEG-TS segment `video/mp2t` by its extension; it holds only audio.
        return passOn(opened, params.file.endsWith('.ts') ? 'audio/mp2t' : undefined);
      } catch (error) {
        const notCutYet = error instanceof AdapterError && error.status === 404;
        if (!notCutYet || tries >= segmentWait.tries || signal.aborted) refusalFor(error);
        await wait(segmentWait.everyMs, signal);
        if (signal.aborted) refusalFor(error);
      }
    }
  });
}
