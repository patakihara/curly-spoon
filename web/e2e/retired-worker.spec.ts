import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

/**
 * The old Auralis left a workbox worker at /sw.js that kept serving the old app from its
 * precache. Here a stand-in of it, installed in a real Chromium, is replaced by what the app now
 * serves at that address: the tab reloads onto the new app, with no cache and no worker left.
 *
 * A small proxy in front of the app answers /sw.js with the old worker until the app is
 * deployed, then passes everything through, as the container did on the day it was updated.
 */
const OLD_WORKER = `
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open('workbox-precache-v2').then((cache) =>
      cache.put('/', new Response('<!doctype html><title>Old Auralis</title>', {
        headers: { 'content-type': 'text/html' },
      })),
    ),
  );
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open('workbox-precache-v2').then((cache) => cache.match('/')));
  }
});
`;

let proxy: Server;
let origin: string;
let deployed = false;

test.beforeAll(async () => {
  const app = test.info().project.use.baseURL!;
  proxy = createServer((req, res) => {
    void (async () => {
      if (!deployed && req.url === '/sw.js') {
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-cache' });
        res.end(OLD_WORKER);
        return;
      }
      const upstream = await fetch(new URL(req.url ?? '/', app), {
        headers: { accept: req.headers.accept ?? '*/*' },
        redirect: 'manual',
      });
      const headers = Object.fromEntries(upstream.headers);
      delete headers['content-encoding'];
      delete headers['content-length'];
      delete headers['transfer-encoding'];
      res.writeHead(upstream.status, headers);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    })();
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((resolve) => proxy.close(() => resolve())));

test('[M0.staging/b] the old app’s worker is replaced: the tab reloads onto the new app, with no cache or worker left', async ({
  page,
}) => {
  // A browser that used the old app: its worker installed and serving the old page.
  await page.goto(`${origin}/`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page).toHaveTitle('Old Auralis');

  // The new app is deployed. The next visit loads the old page, the browser finds the new
  // worker at /sw.js, and it takes the tab onto the new app on its own.
  deployed = true;
  await page.goto(`${origin}/`);
  await expect(page).toHaveTitle('Auralis', { timeout: 15_000 });

  const left = await page.evaluate(async () => ({
    caches: await caches.keys(),
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  expect(left).toEqual({ caches: [], workers: 0 });
});
