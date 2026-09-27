import { existsSync } from 'node:fs';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { health } from '@auralis/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAccess } from './auth/access.js';
import { createProxyTrust, type ProxyTrust } from './auth/proxy.js';
import type { CookieSecure } from './config.js';
import { serve } from './route.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { setupRoutes } from './routes/setup.js';
import type { Db } from './store/connection.js';

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
  logger?: boolean;
}

const INDEX_FILE = 'index.html';

function isIndexHtml(path: string): boolean {
  return path === INDEX_FILE || path.endsWith(`/${INDEX_FILE}`) || path.endsWith(`\\${INDEX_FILE}`);
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { db } = options;
  const proxy = options.proxy ?? createProxyTrust([]);
  const cookieSecure = options.cookieSecure ?? 'auto';
  const app = Fastify({ logger: options.logger ?? false, trustProxy: proxy.trust });

  await app.register(fastifyCookie);
  registerAccess(app, { db, proxy, cookieSecure, publicOrigin: options.publicOrigin });

  serve(app, health, () => ({ status: 'ok' as const }));
  setupRoutes(app, { db, cookieSecure, setupCodeFile: options.setupCodeFile ?? null });
  authRoutes(app, { db, cookieSecure });
  adminRoutes(app, { db });

  const distDir = options.webDistDir;
  if (distDir !== null && existsSync(distDir)) {
    // The plugin only lends `reply.sendFile`; the routes are declared here, public, so the
    // access hook has no undeclared route to guess about.
    await app.register(fastifyStatic, {
      root: distDir,
      serve: false,
      index: false,
      cacheControl: false,
      // Built assets carry content hashes, so they can be cached forever; index.html names
      // them and must always be revalidated.
      setHeaders(res, path) {
        res.setHeader(
          'Cache-Control',
          isIndexHtml(path) ? 'no-cache' : 'public, max-age=31536000, immutable',
        );
      },
    });

    const publicRoute = { config: { access: 'public' as const } };
    app.get('/', publicRoute, (_request, reply) => reply.sendFile(INDEX_FILE));
    app.route({
      ...publicRoute,
      method: ['GET', 'HEAD'],
      url: '/*',
      handler: (request, reply) => reply.sendFile((request.params as { '*': string })['*']),
    });

    // Client-side routes: a browser navigating to a path the server does not know gets the
    // app, which routes it. The access hook lets every not-found request through. Anything else (an API client, a missing asset) gets a JSON 404.
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && (request.headers.accept ?? '').includes('text/html')) {
        return reply.sendFile(INDEX_FILE);
      }
      return reply.code(404).send({ error: 'not_found' });
    });
  } else {
    app.log.warn(`No web build at ${String(distDir)}; serving the API only.`);
  }

  return app;
}
