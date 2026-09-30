import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { health } from '@auralis/schema';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { registerAccess } from './auth/access.js';
import type { SignOn } from './auth/oidc.js';
import { createProxyTrust, type ProxyTrust } from './auth/proxy.js';
import type { CookieSecure } from './config.js';
import { retiredWorkerRoute } from './retiredWorker.js';
import { serve } from './route.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { type PlaybackOptions, playRoutes, type UpstreamAccess } from './routes/play.js';
import { setupRoutes } from './routes/setup.js';
import { SIGN_IN_PAGE, signOnRoutes } from './routes/signOn.js';
import type { Db } from './store/connection.js';
import type { Random } from './store/signIn.js';
import type { Linker } from './upstream/links.js';

export interface BuildAppOptions {
  /** web's build output; `null`, or a path that does not exist, serves no web app. */
  webDistDir: string | null;
  db: Db;
  /** Who may set `X-Forwarded-*`; trusts no one when omitted. */
  proxy?: ProxyTrust;
  cookieSecure?: CookieSecure;
  /** Where browsers load the app from; a signed-in write from elsewhere is refused. */
  publicOrigin?: string | undefined;
  /** Where the one-time setup code was written, removed once it is used. */
  setupCodeFile?: string | null;
  /** The household sign-on; without it the sign-in routes answer 404. */
  signOn?: SignOn | null;
  /** Links each person's upstream accounts at sign-in. */
  linker?: Linker | null;
  /** Acts upstream as each person; without it, playing answers 409. */
  upstreams?: UpstreamAccess | null;
  /** How transcodes are held open and their segments waited for. */
  playback?: PlaybackOptions;
  random?: Random;
  now?: () => number;
  /** The commit the image was built from, reported by the health check; none by default. */
  commit?: string | null;
  /** Off by default; `true` logs to stdout, a stream to it (for a test). */
  logger?: boolean | { stream: { write(line: string): void } };
}

/**
 * Every `/api/auth` route's query is left out of the log: the callback's carries the one-time code and
 * state, and the others say where a person was going.
 */
export function loggedUrl(url: string): string {
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  return q !== -1 && (path === '/api/auth' || path.startsWith('/api/auth/'))
    ? `${path}?<redacted>`
    : url;
}

function loggerOptions(logger: BuildAppOptions['logger']) {
  if (logger === undefined || logger === false) return false;
  const serializers = {
    req: (req: { method: string; url: string; ip?: string }) => ({
      method: req.method,
      url: loggedUrl(req.url),
      remoteAddress: req.ip,
    }),
  };
  return logger === true ? { serializers } : { stream: logger.stream, serializers };
}

const INDEX_FILE = 'index.html';

/** The pages a signed-out visitor may open: signing in and first-run setup, nav.json's bare pages. */
export const OPEN_PAGES: readonly string[] = [SIGN_IN_PAGE, '/setup'];

/** A page (index.html, gallery.html): it names hashed assets, so it is never cached. */
function isPage(path: string): boolean {
  return path.endsWith('.html');
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { db } = options;
  const proxy = options.proxy ?? createProxyTrust([]);
  const cookieSecure = options.cookieSecure ?? 'auto';
  const app = Fastify({ logger: loggerOptions(options.logger), trustProxy: proxy.trust });

  await app.register(fastifyCookie);
  registerAccess(app, { db, proxy, cookieSecure, publicOrigin: options.publicOrigin });

  const commit = options.commit ?? null;
  serve(app, health, () => ({ status: 'ok' as const, commit }));
  setupRoutes(app, { db, cookieSecure, setupCodeFile: options.setupCodeFile ?? null });
  signOnRoutes(app, {
    db,
    cookieSecure,
    signOn: options.signOn ?? null,
    publicOrigin: options.publicOrigin,
    linker: options.linker ?? null,
    random: options.random ?? randomBytes,
    now: options.now ?? Date.now,
  });
  authRoutes(app, { db, cookieSecure });
  deviceRoutes(app, { db, cookieSecure });
  adminRoutes(app, { db });
  playRoutes(app, {
    db,
    upstreams: options.upstreams ?? null,
    ...(options.playback ? { playback: options.playback } : {}),
    ...(options.now ? { now: options.now } : {}),
  });

  const distDir = options.webDistDir;
  if (distDir !== null && existsSync(distDir)) {
    // The plugin only lends `reply.sendFile`; the routes are declared here, public, so the
    // access hook has no undeclared route to guess about.
    await app.register(fastifyStatic, {
      root: distDir,
      serve: false,
      index: false,
      cacheControl: false,
      // Built assets carry content hashes, so they can be cached forever; a page names them
      // and must always be revalidated.
      setHeaders(res, path) {
        res.setHeader(
          'Cache-Control',
          isPage(path) ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    });

    // Each handler sends and returns nothing: a returned reply is awaited, and every await adds
    // close listeners to the response, which a deep link (a missed file, then the not-found
    // handler) piles past Node's warning limit.
    const publicRoute = { config: { access: 'public' as const } };
    retiredWorkerRoute(app);
    // A signed-out visitor opening a page goes to sign in first, keeping where they were going.
    // With no sign-on nobody can sign in, so every page is served as it is.
    const signOnConfigured = (options.signOn ?? null) !== null;
    const sendPage = (request: FastifyRequest, reply: FastifyReply) => {
      const path = request.url.split('?')[0]!;
      const open = OPEN_PAGES.includes(path);
      if (signOnConfigured && request.user === null && !open) {
        const query = new URLSearchParams({ return_to: request.url });
        void reply.redirect(`${SIGN_IN_PAGE}?${query.toString()}`);
        return;
      }
      void reply.sendFile(INDEX_FILE);
    };
    app.get('/', publicRoute, sendPage);
    app.route({
      ...publicRoute,
      method: ['GET', 'HEAD'],
      url: '/*',
      handler: (request, reply) => {
        void reply.sendFile((request.params as { '*': string })['*']);
      },
    });

    // Client-side routes: a browser navigating to a path the server does not know gets the
    // app, which routes it. The access hook lets every not-found request through. Anything else
    // (an API client, a missing asset, any path under /api) gets a JSON 404.
    app.setNotFoundHandler((request, reply) => {
      const api = /^\/api(?:[/?]|$)/.test(request.url);
      if (
        !api &&
        request.method === 'GET' &&
        (request.headers.accept ?? '').includes('text/html')
      ) {
        sendPage(request, reply);
        return;
      }
      void reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.log.warn(`No web build at ${String(distDir)}; serving the API only.`);
  }

  return app;
}
