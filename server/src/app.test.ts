import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes } from '@auralis/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

describe('GET /health', () => {
  it('answers ok', async () => {
    const app = await buildApp({ webDistDir: null });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('the API', () => {
  it('serves every route the schema declares', async () => {
    const app = await buildApp({ webDistDir: null });
    await app.ready();
    for (const r of routes) {
      expect(app.hasRoute({ method: r.method, url: r.path }), `${r.method} ${r.path}`).toBe(true);
    }
    await app.close();
  });
});

describe('serving the web app', () => {
  let dist: string | undefined;
  afterEach(() => {
    if (dist !== undefined) rmSync(dist, { recursive: true, force: true });
    dist = undefined;
  });

  async function appWithDist() {
    dist = mkdtempSync(join(tmpdir(), 'auralis-web-'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Auralis</title>');
    return buildApp({ webDistDir: dist });
  }

  it('serves index.html at the root, never cached', async () => {
    const app = await appWithDist();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Auralis</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('hands a browser the app for a client-side route', async () => {
    const app = await appWithDist();
    const res = await app.inject({
      method: 'GET',
      url: '/library/books',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Auralis</title>');
    await app.close();
  });

  it('answers a non-browser request for an unknown path with a JSON 404', async () => {
    const app = await appWithDist();
    const res = await app.inject({
      method: 'GET',
      url: '/no-such-route',
      headers: { accept: 'application/json' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
    await app.close();
  });
});

describe('loadConfig', () => {
  it('listens on 8787 on all interfaces by default', () => {
    const config = loadConfig({});
    expect(config.port).toBe(8787);
    expect(config.host).toBe('0.0.0.0');
    expect(config.dataDir).toBeUndefined();
  });

  it('refuses a port that is not a number', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow();
  });
});
