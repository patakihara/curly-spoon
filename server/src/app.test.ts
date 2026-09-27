import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes } from '@auralis/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './store/connection.js';

describe('GET /health', () => {
  it('answers ok', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });
});

describe('the API', () => {
  it('serves every route the schema declares', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    await app.ready();
    for (const r of routes) {
      const url = r.path.replace(/\{(\w+)\}/g, ':$1');
      expect(app.hasRoute({ method: r.method, url }), `${r.method} ${r.path}`).toBe(true);
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
    return buildApp({ webDistDir: dist, db: openDatabase(':memory:') });
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
    expect(config.dataDir).toBe('./data');
  });

  it('trusts no proxy, decides Secure per request, and has no fixed public origin by default', () => {
    const config = loadConfig({});
    expect(config.trustProxy).toEqual([]);
    expect(config.cookieSecure).toBe('auto');
    expect(config.publicOrigin).toBeUndefined();
  });

  it('reads the trusted proxies as a comma-separated list of IPs, CIDRs and hostnames', () => {
    const config = loadConfig({ TRUST_PROXY: ' caddy, 192.0.2.10 ,198.51.100.0/24,,' });
    expect(config.trustProxy).toEqual(['caddy', '192.0.2.10', '198.51.100.0/24']);
  });

  it('refuses a trusted proxy that is neither an address nor a hostname', () => {
    expect(() => loadConfig({ TRUST_PROXY: 'caddy,not a host' })).toThrow();
  });

  it('reads COOKIE_SECURE as auto, true or false, and refuses anything else', () => {
    expect(loadConfig({ COOKIE_SECURE: 'true' }).cookieSecure).toBe(true);
    expect(loadConfig({ COOKIE_SECURE: 'false' }).cookieSecure).toBe(false);
    expect(loadConfig({ COOKIE_SECURE: 'auto' }).cookieSecure).toBe('auto');
    expect(() => loadConfig({ COOKIE_SECURE: 'yes' })).toThrow();
  });

  it('reads PUBLIC_ORIGIN as an origin, and refuses one with a path', () => {
    expect(loadConfig({ PUBLIC_ORIGIN: 'https://audio.example.org' }).publicOrigin).toBe(
      'https://audio.example.org',
    );
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'https://audio.example.org/app' })).toThrow();
    expect(() => loadConfig({ PUBLIC_ORIGIN: 'audio.example.org' })).toThrow();
  });

  it('refuses a port that is not a number', () => {
    expect(() => loadConfig({ PORT: 'eighty' })).toThrow();
  });
});
