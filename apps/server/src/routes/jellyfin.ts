/**
 * Jellyfin music routes — config/login, artist/album/track browsing, search, lyrics, and
 * the two proxied byte endpoints a player needs (stream, artwork). Every route sits behind
 * `requireSession`: unlike Audiobookshelf there is no separate first-run "connect the
 * server" step outside a signed-in Auralis session, so `POST /jellyfin/login` both
 * configures the shared base URL and authenticates the calling user in one call.
 *
 * Security-critical: `JellyfinClient.streamUrl`/`imageUrl` embed the access token as
 * the `ApiKey` query parameter, by that package's own design (see `urls.ts`'s file
 * comment) — those URLs must never reach a browser or an APK. `GET
 * /jellyfin/tracks/:itemId/stream` and `GET /jellyfin/items/:itemId/artwork` build the
 * URL server-side, fetch it themselves via `app.upstreamFetch`, and stream the response
 * back, exactly as `routes/media.ts` proxies Audiobookshelf. See `fetchJellyfinMedia`
 * below for why that raw fetch is wrapped rather than left to throw whatever the
 * injected `fetch` throws.
 */

import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { JellyfinError } from '@auralis/jellyfin-client';
import { createRequireSession } from '../auth/requireSession.js';
import { handleUpstreamError, sendError } from '../httpErrors.js';
import { getSettings, setSettings } from '../db/settingsRepo.js';
import { getJellyfinToken, setJellyfinToken } from '../db/jellyfinSecretsRepo.js';
import { AURALIS_JELLYFIN_DEVICE, JELLYFIN_UPSTREAM_KEY } from '../jellyfinUpstream.js';
import { parseInput } from '../validation.js';
import {
  jellyfinAlbumsQuerySchema,
  jellyfinItemIdParamSchema,
  jellyfinLibraryQuerySchema,
  jellyfinLoginBodySchema,
  jellyfinPlaybackProgressBodySchema,
  jellyfinPlaybackReportBodySchema,
  jellyfinSearchQuerySchema,
  jellyfinTracksQuerySchema,
} from './schemas.js';

const PASSTHROUGH_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges'];

function copyHeaders(reply: FastifyReply, upstream: Response): void {
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) reply.header(name, value);
  }
}

/**
 * Fetches a token-bearing Jellyfin URL and returns the raw `Response`. Unlike
 * `AbsClient`'s `fetchCover`/`fetchAudioTrack` — which `media.ts` calls and which
 * already translate a transport failure into an `AbsError` — this is a bare
 * `app.upstreamFetch` call, because `streamUrl`/`imageUrl` are pure URL builders, not
 * client methods. Left unwrapped, a network failure here would throw whatever the
 * injected `fetch` throws (an untyped `TypeError`, in production), falling through
 * `handleUpstreamError` to a generic 500 with no useful `code`. Wrapping it into a
 * `JellyfinError.network` gets the same structured `jellyfin_unreachable` response every
 * other network failure in this file gets — and, just as importantly, `JellyfinError`'s
 * own message never includes the URL it was constructed from (see `errors.ts`), so the
 * token embedded in `url` can never leak into a response body via this path.
 */
async function fetchJellyfinMedia(
  app: FastifyInstance,
  url: string,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  try {
    return await app.upstreamFetch(url, extraHeaders ? { headers: extraHeaders } : undefined);
  } catch (cause) {
    throw JellyfinError.network(cause);
  }
}

export function registerJellyfinRoutes(app: FastifyInstance): void {
  const requireSession = createRequireSession(app.db, app.config.nodeEnv === 'production');

  // ---------------------------------------------------------------------
  // Config / login
  // ---------------------------------------------------------------------

  app.get('/jellyfin/config', { preHandler: requireSession }, async (request, reply) => {
    const settings = getSettings(app.db, JELLYFIN_UPSTREAM_KEY);
    const hasCredentials =
      getJellyfinToken(app.db, request.userId!, app.config.sessionSecret) !== null;
    return reply.send({
      configured: settings !== null,
      baseUrl: settings?.baseUrl ?? null,
      hasCredentials,
    });
  });

  app.post('/jellyfin/login', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinLoginBodySchema, request.body);
    if (!body) return undefined;

    let baseUrl = body.baseUrl;
    if (!baseUrl) {
      const settings = getSettings(app.db, JELLYFIN_UPSTREAM_KEY);
      if (!settings) {
        sendError(
          reply,
          409,
          'jellyfin_not_configured',
          'Jellyfin connection has not been configured yet — include baseUrl',
        );
        return undefined;
      }
      baseUrl = settings.baseUrl;
    }

    try {
      const client = app.jellyfin.forSetup(baseUrl);
      const result = await client.login(body.username, body.password);
      // A failed login above throws before either line here runs — mirrors
      // setup.ts's "a failed probe is never persisted" rule, so a typo'd URL or
      // password never overwrites a previously-working configuration.
      setSettings(app.db, baseUrl, JELLYFIN_UPSTREAM_KEY);
      setJellyfinToken(app.db, request.userId!, result.token, app.config.sessionSecret);
      // The access token itself is never echoed back — only the id/name a UI needs to
      // show "connected as ...".
      return reply.send({
        configured: true,
        baseUrl,
        user: { id: result.user.id, name: result.user.name },
      });
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Library browsing — one flat route per item kind, all through /Items upstream.
  // ---------------------------------------------------------------------

  app.get('/jellyfin/artists', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinLibraryQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getArtists(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/jellyfin/albums', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinAlbumsQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getAlbums(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.get('/jellyfin/tracks', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinTracksQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.getTracks(query));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------

  app.get('/jellyfin/search', { preHandler: requireSession }, async (request, reply) => {
    const query = parseInput(reply, jellyfinSearchQuerySchema, request.query);
    if (!query) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      return reply.send(await client.search(query.term, { limit: query.limit }));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Lyrics — mirrors `JellyfinClient.getLyrics` one route to one method, same shape as
  // every other route here. `getLyrics` already folds Jellyfin's "no lyrics" 404 into a
  // typed `null` (see that method's own doc comment for why — the 404 also covers "item
  // not found", which this route can't tell apart from "no lyrics" either), so a 200 with
  // `{ lyrics: null }` is this route's own honest way of saying the same thing to the web
  // client — never a 404, which the client would otherwise have to special-case away from
  // every other kind of upstream failure this file already maps with `handleUpstreamError`.
  // ---------------------------------------------------------------------

  app.get(
    '/jellyfin/tracks/:itemId/lyrics',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const lyrics = await client.getLyrics(params.itemId);
        return reply.send({ lyrics });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  // ---------------------------------------------------------------------
  // Playback progress reporting — mirrors `JellyfinClient.reportPlaybackStart`/
  // `reportPlaybackProgress`/`reportPlaybackStopped` one route per method. Same shape as
  // every other route here: `requireSession`, `app.jellyfin.forUser`, and
  // `handleUpstreamError` for the not-configured/no-credentials/upstream-failure cases —
  // no new error handling invented for these three.
  // ---------------------------------------------------------------------

  app.post('/jellyfin/playback/start', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinPlaybackReportBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      await client.reportPlaybackStart(body.itemId, body.positionSeconds);
      return reply.code(204).send();
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  app.post(
    '/jellyfin/playback/progress',
    { preHandler: requireSession },
    async (request, reply) => {
      const body = parseInput(reply, jellyfinPlaybackProgressBodySchema, request.body);
      if (!body) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        await client.reportPlaybackProgress(body.itemId, body.positionSeconds, {
          isPaused: body.isPaused,
        });
        return reply.code(204).send();
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.post('/jellyfin/playback/stopped', { preHandler: requireSession }, async (request, reply) => {
    const body = parseInput(reply, jellyfinPlaybackReportBodySchema, request.body);
    if (!body) return undefined;
    try {
      const client = app.jellyfin.forUser(request.userId!);
      await client.reportPlaybackStopped(body.itemId, body.positionSeconds);
      return reply.code(204).send();
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  });

  // ---------------------------------------------------------------------
  // Favourites — mirrors `JellyfinClient.markFavorite`/`unmarkFavorite` one route to one
  // method, same shape as playback progress reporting above: `requireSession`,
  // `app.jellyfin.forUser`, `handleUpstreamError`. Each responds with `{ favorite }`
  // reflecting the state Jellyfin actually recorded (see those client methods' own doc
  // comments for why the return value is trusted over the request's own intent).
  // ---------------------------------------------------------------------

  app.post(
    '/jellyfin/items/:itemId/favorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const favorite = await client.markFavorite(params.itemId);
        return reply.send({ favorite });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  app.delete(
    '/jellyfin/items/:itemId/favorite',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;
      try {
        const client = app.jellyfin.forUser(request.userId!);
        const favorite = await client.unmarkFavorite(params.itemId);
        return reply.send({ favorite });
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );

  // ---------------------------------------------------------------------
  // Proxied media — see this file's doc comment and `fetchJellyfinMedia` above for why
  // the token-bearing URL is built and fetched here, never handed to the caller.
  // ---------------------------------------------------------------------

  async function proxyStream(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
    if (!params) return undefined;

    try {
      const client = app.jellyfin.forUser(request.userId!);
      const url = client.streamUrl(params.itemId, { deviceId: AURALIS_JELLYFIN_DEVICE.deviceId });
      const range = request.headers.range;
      const upstream = await fetchJellyfinMedia(app, url, range ? { Range: range } : undefined);

      reply.code(upstream.status);
      copyHeaders(reply, upstream);

      if (request.method === 'HEAD' || upstream.body === null) {
        return reply.send();
      }
      // Streamed, not buffered — same reasoning as media.ts's audio-track proxy: this
      // is what makes seeking inside a long track practical.
      return reply.send(Readable.fromWeb(upstream.body));
    } catch (err) {
      handleUpstreamError(reply, err);
      return undefined;
    }
  }

  // Registered explicitly rather than relying on Fastify's auto-exposed HEAD-for-GET —
  // same reasoning as media.ts: the auto route would zero out Content-Length.
  const streamRouteOptions = { preHandler: requireSession, exposeHeadRoute: false } as const;
  app.get('/jellyfin/tracks/:itemId/stream', streamRouteOptions, proxyStream);
  app.head('/jellyfin/tracks/:itemId/stream', streamRouteOptions, proxyStream);

  app.get(
    '/jellyfin/items/:itemId/artwork',
    { preHandler: requireSession },
    async (request, reply) => {
      const params = parseInput(reply, jellyfinItemIdParamSchema, request.params);
      if (!params) return undefined;

      try {
        const client = app.jellyfin.forUser(request.userId!);
        const url = client.imageUrl(params.itemId);
        const upstream = await fetchJellyfinMedia(app, url);

        reply.code(upstream.status);
        copyHeaders(reply, upstream);
        // Cover art is content-addressed by item id, so it's safe to cache aggressively —
        // same policy as media.ts's cover route.
        reply.header('Cache-Control', 'public, max-age=86400, immutable');
        return reply.send(Buffer.from(await upstream.arrayBuffer()));
      } catch (err) {
        handleUpstreamError(reply, err);
        return undefined;
      }
    },
  );
}
