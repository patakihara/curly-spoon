/**
 * Playing an item, as the signed-in person. A Jellyfin track or album plans and streams as
 * `jellyfinPlay.ts` says. For an Audiobookshelf item, `POST /api/play` opens an
 * Audiobookshelf session offering the types the clients play (a podcast episode's on its show, as
 * the library index names it), and ABS chooses:
 * - direct play: one track per file at `/api/media/{ref}/tracks/{n}`, chapters at their absolute
 *   positions across files;
 * - a transcode: one HLS track at `/api/media/{ref}/hls/{playId}/output.m3u8`, the transcode
 *   living in the session.
 * Anything else ABS answers, such as a file in a type the clients do not play, is refused 422.
 * Every plan names the session it holds open as its progress target. `POST /api/progress` reports
 * to it: to ABS, a sync with the wall-clock time listened, as the person, never retried, since a
 * repeat counts the listening twice; to Jellyfin, as `jellyfinPlay.ts` says, through the device's
 * line, never waiting for Jellyfin's answer. `POST /api/play/{playId}/close`
 * closes it, with a last report when given; so does planning again on the same device, or its
 * idle time running out. Each play also keeps the device's listening session (`queues/sessions.ts`):
 * the item becomes current, the plan names what plays after it, and progress keeps where the
 * device is, moving the session on through an album's tracks or a book's chapters. A track the
 * session plays on through its album from (a Next or Back inside an album) plans as the rest of
 * that album, so it stays gapless. When the
 * session plays something else after the track or chapter the plan is on (an item put next), the
 * progress answer says where the plan must stop (`endAt`). Every plan names what it plays (`meta`),
 * as the upstream's own answer names it, with art where this server serves it.
 * The media routes pass a checked `Range` through with the person's own token and send the bytes
 * on as they come, never transcoded or buffered whole. An indexed item the person's own account
 * does not reach goes through Auralis's own account instead (`upstream/reach.ts`): a household
 * play. It reports to no upstream. An Audiobookshelf one keeps its position in `held_progress`,
 * where its next plan starts; a Jellyfin one, like any music, keeps none. Only the playlist is read whole, parsed,
 * and passed on with bare segment names that resolve under the same route. A streamed song needs
 * no upstream account: it plays for anyone signed in, only if search or radio has named it, reports
 * nowhere, claims nothing, and every byte comes through `music/`'s cache.
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
  type MediaRef,
  type PlaybackChapter,
  type PlaybackMeta,
  type PlaybackPlan,
  type PlaybackTrack,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  type AbsClient,
  contentUrlParts,
  hlsSessionOf,
} from '../adapters/audiobookshelf/client.js';
import {
  type playSessionSchema,
  SUPPORTED_MIME_TYPES,
} from '../adapters/audiobookshelf/schemas.js';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import { RangeNotSatisfiable, type UpstreamFile } from '../adapters/stream.js';
import { indexedRow } from '../libraryIndex/store.js';
import type { Caller, HeldPlan, PlanEntry, Sessions } from '../queues/sessions.js';
import { Refusal, serve, serveStream, type StreamAnswer } from '../route.js';
import { addClaim } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import { dropHeld, heldOf, keepHeld } from '../store/heldProgress.js';
import { type Linker, type UpstreamConfig, type Upstreams } from '../upstream/links.js';
import { absAccess, Reach } from '../upstream/reach.js';
import { artOf } from './art.js';
import { signedIn } from './auth.js';
import {
  type JellyfinLine,
  jellyfinLine,
  type JellyfinPlan,
  jellyfinReports,
  planJellyfin,
  planRun,
} from './jellyfinPlay.js';
import { type OpenPlays, type UpstreamReport } from './openPlays.js';
import {
  MOST_SONG_SECONDS,
  type Music,
  StreamingUnavailable,
  TrackRefused,
} from '../music/index.js';
import { RangeRefused } from '../music/streamCache.js';
import { streamedTrack } from '../store/streamedTracks.js';
import { type z } from 'zod';

/** What the server needs to act upstream as a person: their tokens' key and the upstreams. */
export interface UpstreamAccess {
  key: Buffer;
  config: UpstreamConfig;
  fetch: FetchLike;
  linker?: Linker;
  /** Auralis's own accounts, which act where a person's own does not reach (`upstream/reach.ts`). */
  household?: Upstreams;
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
  /**
   * How long a play, or a Next at a queue's end, waits for autoplay's pick being worked out before
   * answering without it. Default 3 s (`AUTOPLAY_WAIT_MS`).
   */
  autoplayWaitMs?: number;
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
 * What an Audiobookshelf play is, as its session names it: a book by its title and author, an
 * episode (of `show`) by its own title and its show's; with the book's or the show's art, where
 * this server serves it.
 */
function absMeta(db: Db, session: AbsSession, ref: MediaRef, show: string | null): PlaybackMeta {
  const named = session.mediaMetadata?.title ?? null;
  return {
    title: session.displayTitle ?? named ?? '',
    sub: show === null ? (session.displayAuthor ?? null) : named,
    art: artOf(db, show === null ? ref : { source: 'abs', id: show }),
    variant: 'spoken',
  };
}

/**
 * How to play what ABS answered, reporting to its session, or null when the clients cannot play
 * it: neither direct play of files in types they play, nor one transcode.
 */
function planFor(
  session: AbsSession,
  ref: string,
  meta: PlaybackMeta,
  startAt: number,
): PlaybackPlan | null {
  const [first, ...rest] = session.audioTracks;
  const hls = first === undefined || rest.length > 0 ? null : hlsSessionOf(first.contentUrl);
  if (hls !== null && first?.duration !== undefined) {
    return {
      meta,
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
    meta,
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

/** Why a streamed song cannot play, as this server's answer. */
export function songRefusal(error: unknown): never {
  if (error instanceof StreamingUnavailable) throw new Refusal(503, 'streaming_unavailable');
  if (error instanceof TrackRefused) throw new Refusal(404, 'not_found');
  if (error instanceof RangeRefused) {
    const headers: Record<string, string> =
      error.size === undefined ? {} : { 'content-range': `bytes */${error.size}` };
    throw new Refusal(416, 'range_not_satisfiable', headers);
  }
  throw error;
}

export function playRoutes(
  app: FastifyInstance,
  options: {
    db: Db;
    upstreams: UpstreamAccess | null;
    /** This device's listening session, which every play and progress report keeps. */
    sessions: Sessions;
    /** The playback sessions held open, shared with the listening sessions that close them. */
    open: OpenPlays;
    playback?: PlaybackOptions;
    /** Songs from outside the library. Null or absent, a streamed ref is not linked. */
    music?: Music | null;
    now?: () => number;
  },
): void {
  const { db, upstreams, sessions } = options;
  const music = options.music ?? null;
  const segmentWait = options.playback?.segmentWait ?? DEFAULT_SEGMENT_WAIT;
  const transcodeIdleMs = options.playback?.idleMs ?? DEFAULT_IDLE_MS;
  const directIdleMs = options.playback?.directIdleMs ?? DEFAULT_DIRECT_IDLE_MS;
  const { open } = options;
  /** Each device's line to Jellyfin, by `userId deviceId`, kept for every play it makes. */
  const lines = new Map<string, JellyfinLine>();
  const lineFor = (userId: string, deviceId: string) => {
    const key = `${userId} ${deviceId}`;
    const line = lines.get(key) ?? jellyfinLine(app.log);
    lines.set(key, line);
    return line;
  };
  const sweeper = setInterval(() => void open.sweep(), SWEEP_EVERY_MS);
  sweeper.unref();
  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    await open.closeAll();
  });

  const reach = new Reach(db, upstreams);

  /**
   * Who acts for the caller on `ref`, after closing any play gone idle: their own account where it
   * reaches, Auralis's on an indexed item it does not. Their own stands where the index holds no
   * such item, or their own check fails (logged): their upstream then says what it says.
   */
  const personFor = async <S extends keyof Upstreams>(
    request: FastifyRequest,
    source: S,
    ref: MediaRef,
  ): Promise<{
    client: NonNullable<Upstreams[S]>;
    household: boolean;
    userId: string;
    deviceId: string;
  }> => {
    await open.sweep();
    const user = signedIn(request);
    const owner = { userId: user.id, deviceId: user.deviceId };
    const own = reach.own(user)[source];
    const row = indexedRow(db, ref.source, ref.id);
    const stayOwn = () => {
      if (own === null) throw new Refusal(409, 'not_linked');
      return { client: own as NonNullable<Upstreams[S]>, household: false, ...owner };
    };
    if (row === undefined || reach.household(source) === null) return stayOwn();
    try {
      const acting = await reach.pick(user, source, row);
      return acting === null ? stayOwn() : { ...acting, ...owner };
    } catch (err) {
      app.log.warn({ err }, 'could not check what the person’s own account reaches');
      return stayOwn();
    }
  };
  /** The show an Audiobookshelf id is an episode of, as the library index holds it; else null. */
  const showOf = (id: string): string | null => {
    const row = indexedRow(db, 'abs', id);
    return row?.kind === 'episode' ? row.parentId : null;
  };
  const absFor = async (request: FastifyRequest, ref: MediaRef) => {
    const { client, ...owner } = await personFor(request, 'abs', ref);
    return { abs: client, ...owner };
  };

  /**
   * Where a play's plan starts. A household play's own position is what Auralis holds. On the
   * person's own account, what it held from before their account reached the item counts while it
   * is the newer; Audiobookshelf says the rest. A finished item starts over.
   */
  const startOf = async (
    abs: AbsClient,
    household: boolean,
    userId: string,
    ref: MediaRef,
    upstream: number,
  ): Promise<number> => {
    const held = heldOf(db, userId, ref);
    if (household) return held === undefined || held.finished ? 0 : held.position;
    if (held === undefined) return upstream;
    const own = await absAccess(abs).catch(() => null);
    if ((own?.standing(ref.id).updatedAt ?? 0) > held.updatedAt) return upstream;
    return held.finished ? 0 : held.position;
  };

  /**
   * The plan as this device's session has it: what plays after it, and where to start when the
   * session's position in the item is newer than the upstream's. A session that cannot be kept
   * (logged) leaves the plan as the upstream planned it.
   */
  const inSession = async (
    caller: Caller,
    plan: PlaybackPlan,
    ref: MediaRef,
    heldBefore: string | null,
    entries: readonly PlanEntry[],
  ): Promise<PlaybackPlan> => {
    try {
      const { next, position } = await sessions.played(
        caller,
        plan.progressTarget.playId,
        ref,
        heldBefore,
        entries,
      );
      const last = plan.tracks[plan.tracks.length - 1]!;
      const length = last.offset + last.duration;
      if (next?.source === 'ytmusic') music?.preload(caller.deviceId, next.id);
      return {
        ...plan,
        ...(position === null ? {} : { startAt: Math.min(position.ms / 1000, length) }),
        ...(next === undefined ? {} : { next }),
      };
    } catch (err) {
      app.log.warn({ err }, 'the listening session could not keep this play');
      return plan;
    }
  };

  /**
   * How to play a Jellyfin ref: a track the session plays on through its album from, as that
   * part of the album's own plan; anything else, or a run the album's tracks do not hold, alone.
   * A session that cannot be read (logged) plans the ref alone.
   */
  const jellyfinPlan = async (
    client: JellyfinClient,
    caller: Caller,
    ref: MediaRef,
  ): Promise<JellyfinPlan> => {
    const art = (r: MediaRef) => artOf(db, r);
    let run: { album: string | null; refs: MediaRef[] } = { album: null, refs: [ref] };
    try {
      run = sessions.albumRun(caller, ref);
    } catch (err) {
      app.log.warn({ err }, 'the listening session could not say what plays after this track');
    }
    if (run.album !== null) {
      const album = await client.getPlayable(run.album).catch(refusalFor);
      const whole = await planJellyfin(client, album, art).catch(refusalFor);
      const part = planRun(
        whole,
        run.refs.map((r) => r.id),
      );
      if (part !== null) return part;
    }
    const item = await client.getPlayable(ref.id).catch(refusalFor);
    return planJellyfin(client, item, art).catch(refusalFor);
  };

  /** Keeps where the device is in a play's plan on its session; a failure is only logged. */
  const keepPosition = (caller: Caller, held: HeldPlan | null, position: number) => {
    if (held === null) return;
    try {
      sessions.progress(caller, held, position);
    } catch (err) {
      app.log.warn({ err }, 'the listening session could not keep a position');
    }
  };

  /**
   * Where the session says a play must stop, given where its taken report says it is; a failure
   * is only logged, and says nothing.
   */
  const stopAt = (
    caller: Caller,
    held: HeldPlan | null,
    position: number | undefined,
  ): number | undefined => {
    if (held === null) return undefined;
    try {
      return sessions.endAt(caller, held, position);
    } catch (err) {
      app.log.warn({ err }, 'the listening session could not say where the play ends');
      return undefined;
    }
  };

  /** Playing a thing makes it the person's own: a track's album, an episode's show, or itself. */
  const claimPlayed = (ref: MediaRef, userId: string) => {
    const parent = indexedRow(db, ref.source, ref.id)?.parentId ?? null;
    const held = parent === null ? ref : { source: ref.source, id: parent };
    addClaim(db, userId, held, 'played', (options.now ?? Date.now)());
  };

  /** A streamed song's plan, from its own row and how its file is typed. */
  const playSong = async (
    songs: Music,
    caller: Caller,
    ref: MediaRef,
    heldBefore: string | null,
  ): Promise<PlaybackPlan> => {
    const song = streamedTrack(db, ref.id);
    if (song === undefined) throw new Refusal(404, 'not_found');
    if (song.duration > MOST_SONG_SECONDS) throw new Refusal(422, 'unsupported_format');
    const { mime } = await songs.plan(ref.id).catch(songRefusal);
    const key = mediaRefKey(ref);
    const playId = randomUUID().replace(/-/g, '');
    const entries: PlanEntry[] = [{ entry: { ref }, start: 0 }];
    const owner = { userId: caller.id, deviceId: caller.deviceId };
    await open.planOn(owner, async () => {
      await open.closeDevice(owner.userId, owner.deviceId);
      await open.open({
        playId,
        ...owner,
        ref: key,
        entries,
        duration: song.duration,
        idleMs: directIdleMs,
        report: async () => undefined,
        close: async () => undefined,
      });
    });
    const plan: PlaybackPlan = {
      meta: {
        title: song.title,
        sub: song.artists.join(', '),
        art: artOf(db, ref),
        variant: 'music',
      },
      tracks: [{ url: `/api/media/${key}/tracks/0`, mime, duration: song.duration, offset: 0 }],
      chapters: [],
      startAt: 0,
      progressTarget: { playId },
    };
    return inSession(caller, plan, ref, heldBefore, entries);
  };

  serve(app, play, async (request, _reply, body) => {
    const ref = mediaRefKey(body.ref);
    const caller = signedIn(request);
    const heldBefore = open.heldBy({ userId: caller.id, deviceId: caller.deviceId });
    if (body.ref.source === 'ytmusic') {
      if (music === null) throw new Refusal(409, 'not_linked');
      return playSong(music, caller, body.ref, heldBefore);
    }
    if (body.ref.source === 'jellyfin') {
      if (parseMediaRefKey(ref) === null) throw new Refusal(400, 'bad_request');
      const { client, household, userId, deviceId } = await personFor(
        request,
        'jellyfin',
        body.ref,
      );
      const { plan, played } = await jellyfinPlan(client, caller, body.ref);
      // Jellyfin's own play session ids are 32 hex digits (recorded).
      const playId = randomUUID().replace(/-/g, '');
      // A household play tells Jellyfin nothing: no one's account hears of it.
      const reports = household
        ? { start: () => undefined, report: () => undefined, close: () => undefined }
        : jellyfinReports(client, played, playId, lineFor(userId, deviceId));
      const entries = played.map((t): PlanEntry => ({
        entry: { ref: { source: 'jellyfin', id: t.id } },
        start: t.offset,
      }));
      const last = plan.tracks[plan.tracks.length - 1]!;
      await open.planOn({ userId, deviceId }, async () => {
        // The device's track before stops before Jellyfin hears this one started.
        await open.closeDevice(userId, deviceId);
        reports.start();
        await open.open({
          playId,
          userId,
          deviceId,
          ref,
          entries,
          duration: last.offset + last.duration,
          idleMs: directIdleMs,
          report: async (report) => reports.report(report),
          close: async (report) => reports.close(report),
        });
      });
      claimPlayed(body.ref, caller.id);
      return inSession(
        caller,
        { ...plan, progressTarget: { playId } },
        body.ref,
        heldBefore,
        entries,
      );
    }
    const { abs, household, userId, deviceId } = await absFor(request, body.ref);
    const show = showOf(body.ref.id);
    const device = { deviceId, clientVersion: CLIENT_VERSION };
    const session = await (
      show === null ? abs.play(body.ref.id, device) : abs.playEpisode(show, body.ref.id, device)
    ).catch(refusalFor);
    const startAt = await startOf(abs, household, userId, body.ref, session.currentTime ?? 0);
    const plan = planFor(session, ref, absMeta(db, session, body.ref, show), startAt);
    if (plan === null) {
      // A failed close loses nothing.
      await abs.closeSession(session.id).catch(() => undefined);
      await open.planOn({ userId, deviceId }, () => open.closeDevice(userId, deviceId));
      throw new Refusal(422, 'unsupported_format');
    }
    const playId = plan.progressTarget.playId;
    // A book queues as its chapters; an episode, or a book without chapters, as itself.
    const entries: PlanEntry[] =
      show === null && plan.chapters.length > 0
        ? plan.chapters.map((c, chapter) => ({ entry: { ref: body.ref, chapter }, start: c.start }))
        : [{ entry: { ref: body.ref }, start: 0 }];
    const last = plan.tracks[plan.tracks.length - 1]!;
    const duration = session.duration ?? last.offset + last.duration;
    const sync = ({ position, listened }: UpstreamReport) => ({
      currentTime: position,
      timeListened: listened,
      duration,
    });
    const hold = ({ position }: UpstreamReport, at = (options.now ?? Date.now)()) =>
      keepHeld(db, userId, body.ref, { position, duration }, at);
    await open.planOn({ userId, deviceId }, () =>
      open.open({
        playId,
        userId,
        deviceId,
        ref,
        entries,
        duration,
        idleMs: plan.tracks[0]?.mime === HLS_MIME ? transcodeIdleMs : directIdleMs,
        report: async (report) => {
          if (household) return hold(report);
          await abs.syncSession(playId, sync(report));
          dropHeld(db, userId, body.ref);
        },
        close: async (report, reportedAt) => {
          if (household) {
            if (report !== undefined) hold(report, reportedAt);
            return abs.closeSession(playId);
          }
          await abs.closeSession(playId, report && sync(report));
          if (report !== undefined) dropHeld(db, userId, body.ref);
        },
      }),
    );
    claimPlayed(body.ref, caller.id);
    return inSession(caller, plan, body.ref, heldBefore, entries);
  });

  serve(app, reportProgress, async (request, _reply, body) => {
    await open.sweep();
    const caller = signedIn(request);
    const owner = { userId: caller.id, deviceId: caller.deviceId };
    const { playId, ...report } = body;
    const answer = await open.report(playId, owner, report).catch(refusalFor);
    if (answer === null) throw new Refusal(404, 'not_found');
    const held = open.planOf(playId, owner);
    if (answer.taken) keepPosition(caller, held, report.position);
    const endAt = stopAt(caller, held, answer.taken ? report.position : undefined);
    return endAt === undefined ? answer : { ...answer, endAt };
  });

  serve(app, closePlay, async (request, _reply, body, { params }) => {
    await open.sweep();
    const caller = signedIn(request);
    const owner = { userId: caller.id, deviceId: caller.deviceId };
    const held = open.planOf(params.playId, owner);
    const closed = await open.finish(params.playId, owner, body).catch(refusalFor);
    if (!closed) throw new Refusal(404, 'not_found');
    if (body !== undefined) keepPosition(caller, held, body.position);
    return { ok: true };
  });

  serveStream(app, mediaTrack, async (request, { params, range, signal }) => {
    const ref = parseMediaRefKey(params.ref);
    if (ref === null) throw new Refusal(400, 'bad_request');
    if (ref.source === 'ytmusic') {
      if (params.n !== '0' || music === null || streamedTrack(db, ref.id) === undefined) {
        throw new Refusal(404, 'not_found');
      }
      return music.open(ref.id, range, signal).catch(songRefusal);
    }
    if (ref.source === 'jellyfin') {
      // A Jellyfin track is its own ref's only track. Jellyfin streams to anyone with the id, so
      // the person's own lookup decides whether they may have it.
      if (params.n !== '0') throw new Refusal(404, 'not_found');
      const { client } = await personFor(request, 'jellyfin', ref);
      const item = await client.getPlayable(ref.id).catch(refusalFor);
      if (item.Type !== 'Audio') throw new Refusal(404, 'not_found');
      return passOn(await client.openAudio(ref.id, range).catch(refusalFor));
    }
    const { abs } = await absFor(request, ref);
    const show = showOf(ref.id);
    if (show !== null) {
      // An episode is one file of its show, read as the index reads the show.
      if (params.n !== '0') throw new Refusal(404, 'not_found');
      const summary = await abs.getItemSummary(show).catch(refusalFor);
      const episode =
        summary.mediaType === 'podcast'
          ? summary.media.episodes.find((e) => e.id === ref.id)
          : undefined;
      const ino = episode?.audioFile?.ino;
      if (ino === undefined) throw new Refusal(404, 'not_found');
      return passOn(await abs.openFile({ itemId: show, ino }, range).catch(refusalFor));
    }
    const item = await abs.getItem(ref.id).catch(refusalFor);
    const track = item.media.tracks?.[Number(params.n)];
    const file = track === undefined ? null : contentUrlParts(track.contentUrl);
    if (file === null) throw new Refusal(404, 'not_found');
    return passOn(await abs.openFile(file, range).catch(refusalFor));
  });

  serveStream(app, mediaHls, async (request, { params, range, signal }) => {
    const ref = parseMediaRefKey(params.ref);
    if (ref === null) throw new Refusal(400, 'bad_request');
    const { abs, userId, deviceId } = await absFor(request, ref);
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
