import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './store/connection.js';

/**
 * The old Auralis (tag `legacy`) installed a service worker at /sw.js that kept serving the old
 * app from its own caches. The container answers that address with a worker that retires it.
 */

let dist: string | undefined;
afterEach(() => {
  if (dist !== undefined) rmSync(dist, { recursive: true, force: true });
  dist = undefined;
});

async function appWithDist() {
  dist = mkdtempSync(join(tmpdir(), 'auralis-web-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Auralis</title>');
  return buildApp({ webDistDir: dist, db: openDatabase(':memory:') });
}

type Listener = (event: { waitUntil(p: Promise<unknown>): void }) => void;

/** Runs `script` as a service worker would, in a scope that records what it does. */
function runWorker(script: string) {
  const listeners = new Map<string, Listener>();
  const done: string[] = [];
  const cacheNames = ['workbox-precache-v2-https://audio.example/', 'workbox-runtime'];
  const windows = [
    { url: 'https://audio.example/library', navigate: (url: string) => done.push(`reload ${url}`) },
    { url: 'https://audio.example/', navigate: (url: string) => done.push(`reload ${url}`) },
  ];
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: () => {
      done.push('skip waiting');
      return Promise.resolve();
    },
    registration: {
      unregister: () => {
        done.push('unregister');
        return Promise.resolve(true);
      },
    },
    clients: {
      matchAll: (options: { type?: string; includeUncontrolled?: boolean }) => {
        done.push(`find ${options.type ?? 'all'} clients`);
        return Promise.resolve(windows);
      },
    },
  };
  const caches = {
    keys: () => Promise.resolve([...cacheNames]),
    delete: (name: string) => {
      done.push(`delete cache ${name}`);
      cacheNames.splice(cacheNames.indexOf(name), 1);
      return Promise.resolve(true);
    },
  };
  new Function('self', 'caches', script)(self, caches);
  async function fire(type: string) {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ waitUntil: (p) => pending.push(p) });
    await Promise.all(pending);
  }
  return { fire, done, cacheNames };
}

describe('[M0.staging/b] retiring the old app’s service worker', () => {
  it('answers the old worker’s address with a script that clears the site’s caches and storage', async () => {
    const app = await appWithDist();
    const res = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/javascript/);
    expect(res.headers['clear-site-data']).toBe('"cache", "storage"');
    expect(res.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('installs at once, clears every cache, unregisters itself, then reloads every open window', async () => {
    const app = await appWithDist();
    const script = (await app.inject({ method: 'GET', url: '/sw.js' })).body;
    await app.close();

    const worker = runWorker(script);
    await worker.fire('install');
    expect(worker.done).toEqual(['skip waiting']);
    await worker.fire('activate');
    expect(worker.cacheNames).toEqual([]);
    expect(worker.done.slice(1)).toEqual([
      'delete cache workbox-precache-v2-https://audio.example/',
      'delete cache workbox-runtime',
      'unregister',
      'find window clients',
      'reload https://audio.example/library',
      'reload https://audio.example/',
    ]);
  });
});
