/**
 * Serves the built web app (`apps/web/dist`) from this same Fastify process, on
 * the same origin as `/api/v1` — "one container, one port"
 * (docs/ARCHITECTURE.md, docs/ROADMAP.md § 4). Behind a config flag
 * (`AURALIS_SERVE_WEB`, default on) precisely so `pnpm dev` keeps working
 * unchanged: it runs the Vite dev server separately, with its own proxy back to
 * this BFF (apps/web/vite.config.ts), and never produces a `dist` to serve —
 * the *real* gate here is "does a build exist on disk", checked below, with the
 * env flag as an explicit override for the rarer case of wanting it off anyway.
 *
 * Cache policy is the two-line version of "cache-bust via filename, not via
 * headers": hashed assets (`/assets/*.<hash>.js` etc.) are `immutable` — safe to
 * cache forever, because a new build never reuses a filename — while
 * `index.html`, the one file whose *content* (which hashed filenames it
 * references) changes on every deploy without its own name changing, is always
 * revalidated.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from './config.js';
import { sendError } from './httpErrors.js';

/** `apps/web/dist`, resolved relative to this file so it works regardless of cwd. */
export const DEFAULT_WEB_DIST_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url));

const INDEX_FILE = 'index.html';

function isIndexHtml(path: string): boolean {
  return path === INDEX_FILE || path.endsWith(`/${INDEX_FILE}`) || path.endsWith(`\\${INDEX_FILE}`);
}

/**
 * Registers static serving (if enabled and a build is present) *and*, in every
 * case, the app's one and only 404 handler: `/api/*` misses always get the
 * ordinary `{ error: { code, message } }` shape; everything else gets the
 * SPA's `index.html` when a build is actually being served, or that same JSON
 * 404 otherwise (a fresh checkout with no web build yet should still boot).
 *
 * This is wrapped as one real Fastify plugin (`app.register(async (instance) =>
 * ...)`), not a bare async function called fire-and-forget: Fastify's own boot
 * sequencing (avvio) only waits for things registered this way before the app
 * is considered ready. Without that, a request arriving right at startup could
 * race this function's own async setup and see the wrong 404 shape.
 */
export async function registerStaticServing(
  app: FastifyInstance,
  config: AppConfig,
): Promise<void> {
  // `register` resolves to the Fastify instance, not void, so it is awaited and
  // discarded rather than returned — callers only care that boot has settled.
  await app.register(async (instance) => {
    let serving = false;

    if (config.serveWeb !== false) {
      const distDir = config.webDistDir ?? DEFAULT_WEB_DIST_DIR;
      if (existsSync(distDir)) {
        await instance.register(fastifyStatic, {
          root: distDir,
          index: false, // index.html is served explicitly below, with its own cache header
          wildcard: true,
          // `@fastify/static`'s own `cacheControl` default sets its header *after*
          // `setHeaders` runs, silently overwriting whatever this callback sets —
          // disabling it here is what makes the override below actually stick.
          cacheControl: false,
          setHeaders(res, path) {
            res.setHeader(
              'Cache-Control',
              isIndexHtml(path) ? 'no-cache' : 'public, max-age=31536000, immutable',
            );
          },
        });

        // An explicit route for the exact root path: `@fastify/static`'s own
        // wildcard handler treats `/` as "list this directory" (and 403s,
        // since `index: false` leaves it nothing to list into) rather than
        // falling through to the 404 handler below — always wins over the
        // wildcard route regardless of registration order, so this is the one
        // reliable way to hand `/` the SPA shell like every other route.
        instance.get('/', (_request, reply) => {
          void reply.sendFile(INDEX_FILE);
        });

        serving = true;
      } else {
        instance.log.warn(
          `Web build not found at ${distDir} — not serving it. Run \`pnpm --filter @auralis/web build\`, or use \`pnpm dev\` for the Vite dev server.`,
        );
      }
    }

    instance.setNotFoundHandler((request, reply) => {
      if (!serving || request.raw.url?.startsWith('/api/')) {
        sendError(reply, 404, 'not_found', 'No such route');
        return;
      }
      // SPA fallback: any other unmatched path is a client-side route
      // (`/library/$id`, `/item/$id`, …) — hand back `index.html` and let the
      // router in the bundle take it from there.
      void reply.sendFile(INDEX_FILE);
    });
  });
}
