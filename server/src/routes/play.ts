/**
 * Playing an Audiobookshelf item, as the signed-in person. `POST /api/play` opens an
 * Audiobookshelf session offering the types the clients play, and ABS chooses:
 * - direct play: one track per file at `/api/media/{ref}/tracks/{n}`, chapters at their absolute
 *   positions across files, and the session closed at once, since nothing reports progress yet;
 * - a transcode: one HLS track at `/api/media/{ref}/hls/{playId}/output.m3u8`, the session kept
 *   open because the transcode lives in it, named as the progress target, and closed by
 *   `POST /api/play/{playId}/close`.
 * The media routes pass a checked `Range` through with the person's own token and send the bytes
 * on as they come, never transcoded or buffered whole. Only the playlist is read whole, parsed,
 * and passed on with bare segment names that resolve under the same route.
 */
import {
  HLS_MIME,
  mediaHls,
  mediaRefKey,
  mediaTrack,
  parseMediaRefKey,
  closePlay,
  play,
  type PlaybackChapter,
  type PlaybackPlan,
  type PlaybackTrack,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  type AbsClient,
  contentUrlParts,
  hlsSessionOf,
  type UpstreamFile,
} from '../adapters/audiobookshelf/client.js';
import { type playSessionSchema } from '../adapters/audiobookshelf/schemas.js';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { Refusal, serve, serveStream, type StreamAnswer } from '../route.js';
import type { Db } from '../store/connection.js';
import { type Linker, type UpstreamConfig, upstreamFor } from '../upstream/links.js';
import { signedIn } from './auth.js';
import { type z } from 'zod';

/** What the server needs to act upstream as a person: their tokens' key and the upstreams. */
export interface UpstreamAccess {
  key: Buffer;
  config: UpstreamConfig;
  fetch: FetchLike;
  linker?: Linker;
}

const CLIENT_VERSION = '0.0.0';

/**
 * ABS answers 404 for a segment its transcode has not cut yet (recorded), and players give up
 * on a 404. The proxy asks again for up to this long before passing the 404 on.
 */
const SEGMENT_WAIT = { tries: 20, everyMs: 500 };
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

/** How to play what ABS answered, or null when it is neither direct play nor one transcode. */
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
  return { tracks, chapters: planChapters(session, last.offset + last.duration), startAt };
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

/** An upstream failure as this server's answer: a missing item or range stays that. */
function refusalFor(error: unknown): never {
  if (error instanceof AdapterError) {
    if (error.status === 404) throw new Refusal(404, 'not_found');
    if (error.status === 416) throw new Refusal(416, 'range_not_satisfiable');
    throw new Refusal(502, 'upstream_failed');
  }
  throw error;
}

export function playRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null },
): void {
  const { db, upstreams } = options;

  const absFor = (request: FastifyRequest): { abs: AbsClient; deviceId: string } => {
    const user = signedIn(request);
    const abs = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user).abs;
    if (abs === null) throw new Refusal(409, 'not_linked');
    return { abs, deviceId: user.deviceId };
  };

  serve(app, play, async (request, _reply, body) => {
    const { abs, deviceId } = absFor(request);
    const session = await abs
      .play(body.ref.id, { deviceId, clientVersion: CLIENT_VERSION })
      .catch(refusalFor);
    let plan: PlaybackPlan | null = null;
    try {
      plan = planFor(session, mediaRefKey(body.ref));
      if (plan === null) throw new Refusal(502, 'unplayable');
      return plan;
    } finally {
      // A transcode lives in its session; anything else is closed now, since nothing reports
      // progress yet. A failed close loses nothing.
      if (plan?.progressTarget === undefined) {
        await abs.closeSession(session.id).catch(() => undefined);
      }
    }
  });

  serve(app, closePlay, async (request, _reply, _body, { params }) => {
    const { abs } = absFor(request);
    await abs.closeSession(params.playId).catch(refusalFor);
    return { ok: true };
  });

  serveStream(app, mediaTrack, async (request, { params, range }) => {
    const ref = parseMediaRefKey(params.ref);
    if (ref === null) throw new Refusal(400, 'bad_request');
    const { abs } = absFor(request);
    const item = await abs.getItem(ref.id).catch(refusalFor);
    const track = item.media.tracks?.[Number(params.n)];
    const file = track === undefined ? null : contentUrlParts(track.contentUrl);
    if (file === null) throw new Refusal(404, 'not_found');
    return passOn(await abs.openFile(file, range).catch(refusalFor));
  });

  serveStream(app, mediaHls, async (request, { params, range }) => {
    if (parseMediaRefKey(params.ref) === null) throw new Refusal(400, 'bad_request');
    const { abs } = absFor(request);
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
        if (!notCutYet || tries >= SEGMENT_WAIT.tries) refusalFor(error);
        await wait(SEGMENT_WAIT.everyMs);
      }
    }
  });
}
