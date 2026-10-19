import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes } from '@auralis/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './store/connection.js';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

describe('GET /api/health', () => {
  it('answers ok, with no commit when the server was not built from one', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', commit: null, signOn: false });
    await app.close();
  });

  it('reports the commit the server was built from', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:'), commit: COMMIT });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok', commit: COMMIT, signOn: false });
    await app.close();
  });

  it('reports its own commit whatever the request claims', async () => {
    const other = 'f'.repeat(40);
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:'), commit: COMMIT });
    const res = await app.inject({
      method: 'GET',
      url: `/api/health?commit=${other}`,
      headers: { 'x-auralis-commit': other, 'x-commit': other, commit: other },
    });
    expect(res.json()).toEqual({ status: 'ok', commit: COMMIT, signOn: false });
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

  it('answers a failure inside the server as { error: "internal" }, logging what failed and telling the client nothing of it', async () => {
    const logged: { level: number; err?: { message?: string } }[] = [];
    const db = openDatabase(':memory:');
    const app = await buildApp({
      webDistDir: null,
      db,
      logger: { stream: { write: (line) => logged.push(JSON.parse(line) as never) } },
    });
    db.close();

    const res = await app.inject({ method: 'GET', url: '/api/setup' });

    expect([res.statusCode, res.json()]).toEqual([500, { error: 'internal' }]);
    expect(res.body).not.toMatch(/database|sqlite/i);
    expect(logged.some((e) => e.level >= 50 && /database/i.test(e.err?.message ?? ''))).toBe(true);
    await app.close();
  });

  it('answers a request the framework refuses before any route, such as a body that is not JSON, as { error }', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });

    const res = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect([res.statusCode, res.json()]).toEqual([400, { error: 'bad_request' }]);
    await app.close();
  });

  it('logs a request the framework refuses at info, with why', async () => {
    const logged: { level: number; msg?: string; err?: { message?: string } }[] = [];
    const app = await buildApp({
      webDistDir: null,
      db: openDatabase(':memory:'),
      logger: { stream: { write: (line) => logged.push(JSON.parse(line) as never) } },
    });

    await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: '{ not json',
    });

    expect(logged.some((e) => e.level === 30 && /JSON/.test(e.err?.message ?? ''))).toBe(true);
    await app.close();
  });

  it('answers a body too large with 413, and a body no route reads with 415, each in its own words', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });

    const large = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ code: 'a'.repeat(1_100_000) }),
    });
    const plain = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'code=a',
    });

    expect([large.statusCode, large.json()]).toEqual([413, { error: 'payload_too_large' }]);
    expect([plain.statusCode, plain.json()]).toEqual([415, { error: 'unsupported_media_type' }]);
    await app.close();
  });

  it('answers a path that does not decode with 400 { error }, never echoing the path', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });

    const res = await app.inject({ method: 'GET', url: '/api/%zz' });

    expect([res.statusCode, res.json()]).toEqual([400, { error: 'bad_request' }]);
    await app.close();
  });

  it('answers headers too large with 431, and a request that is not HTTP with 400, each as { error }', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    const answer = (request: string) =>
      new Promise<string>((resolve) => {
        const socket = connect(port, '127.0.0.1', () => socket.write(request));
        let text = '';
        socket.on('data', (chunk) => (text += chunk.toString()));
        socket.on('error', () => undefined);
        socket.on('close', () => resolve(text));
      });
    const statusAndBody = (text: string) => [
      text.split('\r\n')[0],
      JSON.parse(text.slice(text.indexOf('\r\n\r\n') + 4)) as unknown,
    ];

    const big = await answer(
      `GET /api/health HTTP/1.1\r\nHost: a\r\nX-Big: ${'a'.repeat(20_000)}\r\n\r\n`,
    );
    const garbled = await answer('NOT HTTP AT ALL\r\n\r\n');

    expect(statusAndBody(big)).toEqual([
      'HTTP/1.1 431 Request Header Fields Too Large',
      { error: 'request_header_fields_too_large' },
    ]);
    expect(statusAndBody(garbled)).toEqual(['HTTP/1.1 400 Bad Request', { error: 'bad_request' }]);
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

  it('[M0.staging/b] serves index.html at the root, never cached', async () => {
    const app = await appWithDist();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Auralis</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
    await app.close();
  });

  it('[M0.staging/b] serves the Sonora gallery page, never cached, and a hashed asset for good', async () => {
    const app = await appWithDist();
    writeFileSync(join(dist!, 'gallery.html'), '<!doctype html><title>Sonora gallery</title>');
    mkdirSync(join(dist!, 'assets'));
    writeFileSync(join(dist!, 'assets', 'gallery-abc123.js'), '');
    const page = await app.inject({ method: 'GET', url: '/gallery.html' });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('<title>Sonora gallery</title>');
    expect(page.headers['cache-control']).toBe('no-cache');
    const asset = await app.inject({ method: 'GET', url: '/assets/gallery-abc123.js' });
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    await app.close();
  });

  it('[M0.staging/b] hands a browser the app for a client-side route, never cached', async () => {
    const app = await appWithDist();
    const res = await app.inject({
      method: 'GET',
      url: '/library/books',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Auralis</title>');
    expect(res.headers['cache-control']).toBe('no-cache');
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

  it('answers a range past the end of a file with 416, its Content-Range, and the code the media routes give 416', async () => {
    const app = await appWithDist();

    const res = await app.inject({
      method: 'GET',
      url: '/index.html',
      headers: { range: 'bytes=99999999-' },
    });

    const size = readFileSync(join(dist!, 'index.html')).length;
    expect([res.statusCode, res.headers['content-range'], res.json()]).toEqual([
      416,
      `bytes */${size}`,
      { error: 'range_not_satisfiable' },
    ]);
    await app.close();
  });

  it('answers a folder of the app with 403 forbidden', async () => {
    const app = await appWithDist();
    mkdirSync(join(dist!, 'assets'));

    const res = await app.inject({ method: 'GET', url: '/assets/' });

    expect([res.statusCode, res.json()]).toEqual([403, { error: 'forbidden' }]);
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

  it('closes an unasked-for transcode after 10 minutes by default, or the minutes set', () => {
    expect(loadConfig({}).playIdleMinutes).toBe(10);
    expect(loadConfig({ PLAY_IDLE_MINUTES: '3' }).playIdleMinutes).toBe(3);
    expect(() => loadConfig({ PLAY_IDLE_MINUTES: '0' })).toThrow();
  });

  it('runs the library index hourly by default, not at all at 0, and reads ABS with its own key', () => {
    expect(loadConfig({}).index).toEqual({ everyMinutes: 60, absKeyFile: null });
    expect(loadConfig({ INDEX_EVERY_MINUTES: '0' }).index.everyMinutes).toBe(0);
    expect(() => loadConfig({ INDEX_EVERY_MINUTES: '-5' })).toThrow();
    expect(
      loadConfig({
        ABS_URL: 'http://upstream.invalid',
        ABS_PROVISION_KEY_FILE: '/keys/provision',
        ABS_API_KEY_FILE: '/keys/index',
      }).index.absKeyFile,
    ).toBe('/keys/index');
    expect(() => loadConfig({ ABS_API_KEY_FILE: '/keys/index' })).toThrow(/ABS_URL/);
  });

  it('runs the lyrics backfill hourly by default, not at all at 0, and asks LRCLIB unless its URL is empty', () => {
    expect(loadConfig({}).lyrics).toEqual({ everyMinutes: 60, lrclibUrl: 'https://lrclib.net' });
    expect(loadConfig({ LYRICS_EVERY_MINUTES: '0' }).lyrics.everyMinutes).toBe(0);
    expect(() => loadConfig({ LYRICS_EVERY_MINUTES: '-1' })).toThrow();
    expect(loadConfig({ LRCLIB_URL: '' }).lyrics.lrclibUrl).toBeNull();
    expect(loadConfig({ LRCLIB_URL: 'http://lyrics.invalid' }).lyrics.lrclibUrl).toBe(
      'http://lyrics.invalid',
    );
    expect(() => loadConfig({ LRCLIB_URL: 'lrclib' })).toThrow();
  });

  it('asks LRCLIB only over http or https', () => {
    expect(loadConfig({ LRCLIB_URL: 'https://lyrics.invalid' }).lyrics.lrclibUrl).toBe(
      'https://lyrics.invalid',
    );
    expect(() => loadConfig({ LRCLIB_URL: 'file:///etc/passwd' })).toThrow(/http or https/);
    expect(() => loadConfig({ LRCLIB_URL: 'ftp://lyrics.invalid' })).toThrow(/http or https/);
  });

  it('reads each minutes setting as a plain whole number, blank as 0', () => {
    for (const name of ['INDEX_EVERY_MINUTES', 'LYRICS_EVERY_MINUTES', 'PLAY_IDLE_MINUTES']) {
      expect(() => loadConfig({ [name]: '0x10' }), name).toThrow(/whole number of minutes/);
      expect(() => loadConfig({ [name]: '1e3' }), name).toThrow(/whole number of minutes/);
      expect(() => loadConfig({ [name]: '1.5' }), name).toThrow(/whole number of minutes/);
      expect(() => loadConfig({ [name]: 'abc' }), name).toThrow(/whole number of minutes/);
    }
    expect(loadConfig({ INDEX_EVERY_MINUTES: ' 30 ' }).index.everyMinutes).toBe(30);
    expect(loadConfig({ INDEX_EVERY_MINUTES: '' }).index.everyMinutes).toBe(0);
    expect(loadConfig({ INDEX_EVERY_MINUTES: '  ' }).index.everyMinutes).toBe(0);
    expect(loadConfig({ LYRICS_EVERY_MINUTES: '' }).lyrics.everyMinutes).toBe(0);
    expect(loadConfig({ LYRICS_EVERY_MINUTES: ' ' }).lyrics.everyMinutes).toBe(0);
    expect(() => loadConfig({ PLAY_IDLE_MINUTES: ' ' })).toThrow();
  });

  it("refuses a job interval longer than Node's longest timer, naming the limit", () => {
    // Node's timers hold at most 2^31 - 1 ms; a longer one fires after 1 ms instead.
    const longest = Math.floor((2 ** 31 - 1) / 60_000);
    expect(longest).toBe(35_791);
    for (const name of ['INDEX_EVERY_MINUTES', 'LYRICS_EVERY_MINUTES']) {
      expect(() => loadConfig({ [name]: String(longest + 1) }), name).toThrow(
        /at most 35791 minutes/,
      );
      expect(() => loadConfig({ [name]: '100000' }), name).toThrow(/at most 35791 minutes/);
    }
    expect(loadConfig({ INDEX_EVERY_MINUTES: String(longest) }).index.everyMinutes).toBe(longest);
    expect(loadConfig({ LYRICS_EVERY_MINUTES: String(longest) }).lyrics.everyMinutes).toBe(longest);
  });

  it('reads AURALIS_COMMIT as the full commit the image was built from, empty as none', () => {
    expect(loadConfig({}).commit).toBeNull();
    expect(loadConfig({ AURALIS_COMMIT: '' }).commit).toBeNull();
    expect(loadConfig({ AURALIS_COMMIT: COMMIT }).commit).toBe(COMMIT);
    expect(() => loadConfig({ AURALIS_COMMIT: 'main' })).toThrow();
    expect(() => loadConfig({ AURALIS_COMMIT: COMMIT.slice(0, 7) })).toThrow();
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
