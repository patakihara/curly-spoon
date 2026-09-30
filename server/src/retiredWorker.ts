/**
 * The old Auralis (tag `legacy`) registered a vite-plugin-pwa service worker at `/sw.js`, which
 * kept serving the old app from its precache. A browser checks that address for a new worker on
 * every visit, so the container answers it with one that retires the old: it takes over at once,
 * deletes every cache, unregisters itself and reloads each open window onto the network. It sends
 * no `Clear-Site-Data`: Chromium applies that before the new worker activates, which strands an
 * open tab on the old app with nothing left to reload it (web/e2e/retired-worker.spec.ts).
 */
import type { FastifyInstance } from 'fastify';

/** Where the old app's worker was registered; its workbox chunk loaded only from it. */
export const RETIRED_WORKER_PATH = '/sw.js';

export const RETIRED_WORKER_SCRIPT = `// Retires the old Auralis service worker: clears its caches, then removes itself.
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) await caches.delete(name);
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const window of windows) window.navigate(window.url);
    })(),
  );
});
`;

export function retiredWorkerRoute(app: FastifyInstance): void {
  app.get(RETIRED_WORKER_PATH, { config: { access: 'public' } }, (_request, reply) =>
    reply
      .type('text/javascript; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(RETIRED_WORKER_SCRIPT),
  );
}
