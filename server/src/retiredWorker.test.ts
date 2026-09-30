import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDatabase } from './store/connection.js';

/**
 * The old Auralis (tag `legacy`) installed a service worker at /sw.js. What the worker served
 * there does in a real browser is web/e2e/retired-worker.spec.ts; this is only how it is sent.
 */

let dist: string | undefined;
afterEach(() => {
  if (dist !== undefined) rmSync(dist, { recursive: true, force: true });
  dist = undefined;
});

it('[M0.staging/b] answers the old worker’s address with a script always revalidated, and no Clear-Site-Data', async () => {
  dist = mkdtempSync(join(tmpdir(), 'auralis-web-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Auralis</title>');
  const app = await buildApp({ webDistDir: dist, db: openDatabase(':memory:') });
  for (const url of ['/sw.js', '/']) {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode, url).toBe(200);
    expect(res.headers['cache-control'], url).toBe('no-cache');
    expect(res.headers['clear-site-data'], url).toBeUndefined();
  }
  expect((await app.inject({ method: 'GET', url: '/sw.js' })).headers['content-type']).toMatch(
    /^text\/javascript/,
  );
  await app.close();
});
