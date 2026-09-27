import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { health } from '@auralis/schema';
import Fastify, { type FastifyInstance } from 'fastify';
import { serve } from './route.js';

export interface BuildAppOptions {
  /** web's build output; `null`, or a path that does not exist, serves no web app. */
  webDistDir: string | null;
  logger?: boolean;
}

const INDEX_FILE = 'index.html';

function isIndexHtml(path: string): boolean {
  return path === INDEX_FILE || path.endsWith(`/${INDEX_FILE}`) || path.endsWith(`\\${INDEX_FILE}`);
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  serve(app, health, () => ({ status: 'ok' as const }));

  const distDir = options.webDistDir;
  if (distDir !== null && existsSync(distDir)) {
    await app.register(fastifyStatic, {
      root: distDir,
      index: false,
      wildcard: true,
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

    app.get('/', (_request, reply) => reply.sendFile(INDEX_FILE));

    // Client-side routes: a browser navigating to a path the server does not know gets the
    // app, which routes it. Anything else (an API client, a missing asset) gets a JSON 404.
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
