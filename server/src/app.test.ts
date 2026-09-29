import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes } from '@auralis/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './store/connection.js';

describe('GET /api/health', () => {
  it('answers ok', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
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

  it('sits under /api, so no route clashes with a page of the app', () => {
    for (const r of routes) expect(r.path, `${r.method} ${r.path}`).toMatch(/^\/api\//);
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

  it('hands a browser a deep link without piling listeners on the response', async () => {
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on('warning', onWarning);
    const app = await appWithDist();
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const { port } = app.server.address() as { port: number };
      const res = await fetch(`http://127.0.0.1:${port}/music/albums/x`, {
        headers: { accept: 'text/html' },
      });
      expect(await res.text()).toContain('<title>Auralis</title>');
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnings).not.toContain('MaxListenersExceededWarning');
    } finally {
      process.off('warning', onWarning);
      await app.close();
    }
  });

  it('hands a browser the app at every page of nav.json, /setup included', async () => {
    const nav = JSON.parse(
      readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8'),
    ) as { pages: { route: string }[] };
    const app = await appWithDist();
    for (const { route } of nav.pages) {
      const url =
        route === '*' ? '/no-such-page' : route.replace(/\?.*$/, '').replace(/:\w+/g, 'x');
      const res = await app.inject({ method: 'GET', url, headers: { accept: 'text/html' } });
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('<title>Auralis</title>');
    }
    await app.close();
  });

  it('answers /api/setup from the API, and an unknown /api path with a JSON 404 even for a browser', async () => {
    const app = await appWithDist();
    const setup = await app.inject({
      method: 'GET',
      url: '/api/setup',
      headers: { accept: 'text/html' },
    });
    expect(setup.json()).toEqual({ configured: false });
    const unknown = await app.inject({
      method: 'GET',
      url: '/api/no-such-route',
      headers: { accept: 'text/html' },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'not_found' });
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

describe('[M0.sso/b] loadConfig for the sign-on and the upstreams', () => {
  const oidc = {
    OIDC_ISSUER: 'https://upstream.invalid',
    OIDC_CLIENT_SECRET_FILE: '/run/secrets/oidc',
    PUBLIC_ORIGIN: 'https://app.upstream.invalid',
  };

  it('has no sign-on unless an issuer is given, and keeps the upstream token key in DATA_DIR', () => {
    const config = loadConfig({ DATA_DIR: '/data' });
    expect(config.oidc).toBeNull();
    expect(config.secretKeyFile).toBe('/data/secret.key');
  });

  it('derives the redirect URI from PUBLIC_ORIGIN, with the client id auralis by default', () => {
    expect(loadConfig(oidc).oidc).toEqual({
      issuer: 'https://upstream.invalid',
      clientId: 'auralis',
      clientSecretFile: '/run/secrets/oidc',
      redirectUri: 'https://app.upstream.invalid/api/auth/callback',
    });
  });

  it('refuses a sign-on without PUBLIC_ORIGIN or without the client secret file', () => {
    expect(() => loadConfig({ ...oidc, PUBLIC_ORIGIN: undefined })).toThrow(/PUBLIC_ORIGIN/);
    expect(() => loadConfig({ ...oidc, OIDC_CLIENT_SECRET_FILE: undefined })).toThrow(
      /OIDC_CLIENT_SECRET_FILE/,
    );
  });

  it('reads each upstream with the file its key is in', () => {
    const config = loadConfig({
      ABS_URL: 'http://upstream.invalid:13378',
      ABS_PROVISION_KEY_FILE: '/run/secrets/abs',
      JELLYFIN_URL: 'http://upstream.invalid:8096',
      JELLYFIN_API_KEY_FILE: '/run/secrets/jellyfin',
    });
    expect(config.abs).toEqual({
      url: 'http://upstream.invalid:13378',
      keyFile: '/run/secrets/abs',
    });
    expect(config.jellyfin).toEqual({
      url: 'http://upstream.invalid:8096',
      keyFile: '/run/secrets/jellyfin',
    });
    expect(() => loadConfig({ ABS_URL: 'http://upstream.invalid:13378' })).toThrow(
      /ABS_PROVISION_KEY_FILE/,
    );
  });
});
