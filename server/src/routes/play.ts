/**
 * Direct play of one Audiobookshelf item, as the signed-in person. `POST /api/play` opens an
 * Audiobookshelf session only to read the item's tracks, closes it, and answers a plan whose
 * track URLs are `/api/media/{ref}/tracks/{n}`. That route maps the ref and index to the item's
 * file through its detail, passes a checked `Range` through with the person's own token, and
 * sends the bytes on as they come, never transcoded. M1.play grows this in place: HLS,
 * multi-file, Jellyfin; M1.progress keeps the session open for progress.
 */
import {
  mediaRefKey,
  mediaTrack,
  parseMediaRefKey,
  play,
  type PlaybackTrack,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type AbsClient, contentUrlParts } from '../adapters/audiobookshelf/client.js';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { Refusal, serve, serveStream } from '../route.js';
import type { Db } from '../store/connection.js';
import { type Linker, type UpstreamConfig, upstreamFor } from '../upstream/links.js';
import { signedIn } from './auth.js';

/** What the server needs to act upstream as a person: their tokens' key and the upstreams. */
export interface UpstreamAccess {
  key: Buffer;
  config: UpstreamConfig;
  fetch: FetchLike;
  linker?: Linker;
}

const CLIENT_VERSION = '0.0.0';

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
    try {
      const ref = mediaRefKey(body.ref);
      const tracks = session.audioTracks.map((track, n): PlaybackTrack => {
        if (
          contentUrlParts(track.contentUrl) === null ||
          track.mimeType === undefined ||
          track.duration === undefined
        ) {
          throw new Refusal(502, 'not_direct_play');
        }
        return {
          url: `/api/media/${ref}/tracks/${n}`,
          mime: track.mimeType,
          duration: track.duration,
          offset: track.startOffset ?? 0,
        };
      });
      return { tracks, chapters: [], startAt: session.currentTime ?? 0 };
    } finally {
      // Nothing reports progress yet, so the session is not kept; a failed close loses nothing.
      await abs.closeSession(session.id).catch(() => undefined);
    }
  });

  serveStream(app, mediaTrack, async (request, { params, range }) => {
    const ref = parseMediaRefKey(params.ref);
    if (ref === null) throw new Refusal(400, 'bad_request');
    const { abs } = absFor(request);
    const item = await abs.getItem(ref.id).catch(refusalFor);
    const track = item.media.tracks?.[Number(params.n)];
    const file = track === undefined ? null : contentUrlParts(track.contentUrl);
    if (file === null) throw new Refusal(404, 'not_found');
    const opened = await abs.openFile(file, range).catch(refusalFor);
    const headers = Object.fromEntries(
      Object.entries(opened.headers).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    return { status: opened.status, headers, body: opened.body };
  });
}
