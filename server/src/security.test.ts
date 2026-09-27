import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { routes, SESSION_COOKIE } from '@auralis/schema';
import { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { createProxyTrust, type Lookup } from './auth/proxy.js';
import { type CookieSecure } from './config.js';
import { openDatabase, type Db } from './store/connection.js';
import { createDevice } from './store/devices.js';
import { createSession } from './store/sessions.js';
import { issueSetupCode } from './store/setupCode.js';
import { listUsers, upsertUser } from './store/users.js';

// Example addresses only (RFC 5737 documentation ranges).
const PROXY_IP = '192.0.2.2';
const OTHER_IP = '198.51.100.7';
const CLIENT_IP = '203.0.113.9';
const SAME_ORIGIN = 'http://localhost'; // what inject's default Host, localhost:80, is
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

let dirs: string[] = [];
let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  apps = [];
  dirs = [];
});

interface Options {
  trustProxy?: string[];
  lookup?: Lookup;
  now?: () => number;
  cookieSecure?: CookieSecure;
  publicOrigin?: string;
}

async function server(options: Options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'auralis-security-'));
  dirs.push(dir);
  const setupCodeFile = join(dir, 'setup-code');
  const db = openDatabase(':memory:');
  const proxy = createProxyTrust(options.trustProxy ?? [], {
    ...(options.lookup ? { lookup: options.lookup } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  await proxy.refresh();
  const code = issueSetupCode(db, setupCodeFile);
  const app = await buildApp({
    webDistDir: null,
    db,
    proxy,
    cookieSecure: options.cookieSecure ?? 'auto',
    publicOrigin: options.publicOrigin,
    setupCodeFile,
  });
  // Shows what the server made of the forwarded headers.
  app.get('/probe', { config: { access: 'public' } }, (request) => ({
    ip: request.ip,
    protocol: request.protocol,
  }));
  apps.push(app);
  return { app, db, code, setupCodeFile };
}

function sessionCookieOf(res: LightMyRequestResponse) {
  const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
  if (cookie === undefined) throw new Error(`no ${SESSION_COOKIE} in ${res.statusCode} answer`);
  return cookie;
}

const cookieHeader = (token: string) => `${SESSION_COOKIE}=${token}`;

function claim(
  app: FastifyInstance,
  code: string,
  extra: { remoteAddress?: string; headers?: Record<string, string> } = {},
) {
  return app.inject({
    method: 'POST',
    url: '/setup',
    payload: { code, username: 'sofia' },
    ...extra,
  });
}

async function claimedAdmin(app: FastifyInstance, code: string) {
  const res = await claim(app, code);
  expect(res.statusCode).toBe(200);
  return cookieHeader(sessionCookieOf(res).value);
}

function memberCookie(db: Db) {
  const member = upsertUser(db, { username: 'kara', role: 'member' });
  const device = createDevice(db, { userId: member.id, kind: 'web' });
  return cookieHeader(createSession(db, { userId: member.id, deviceId: device.id }).token);
}

const signedIn = (cookie: string, origin = SAME_ORIGIN) => ({ cookie, origin });

function bodyFor(method: string, path: string) {
  return method === 'POST' && path === '/setup' ? { username: 'kara' } : undefined;
}

describe('one-time setup', () => {
  it('[M0.security/a] a second setup without an admin session is refused', async () => {
    const { app, db, code } = await server();
    await claimedAdmin(app, code);

    const noSession = await app.inject({
      method: 'POST',
      url: '/setup',
      payload: { username: 'mallory' },
    });
    expect(noSession.statusCode).toBe(401);

    const oldCode = await app.inject({
      method: 'POST',
      url: '/setup',
      payload: { code, username: 'mallory' },
    });
    expect(oldCode.statusCode).toBe(401);

    const asMember = await app.inject({
      method: 'POST',
      url: '/setup',
      headers: signedIn(memberCookie(db)),
      payload: { username: 'kara' },
    });
    expect(asMember.statusCode).toBe(403);

    const admins = listUsers(db).filter((u) => u.role === 'admin');
    expect(admins.map((u) => u.username)).toEqual(['sofia']);
  });

  it('[M0.security/a] a codeless setup racing the claim gets nothing, even once the claim lands', async () => {
    const { app, db, code } = await server();

    const [claimed, codeless] = await Promise.all([
      claim(app, code),
      app.inject({ method: 'POST', url: '/setup', payload: { username: 'mallory' } }),
    ]);

    expect(claimed.statusCode).toBe(200);
    expect(codeless.statusCode).toBe(401);
    expect(codeless.headers['set-cookie']).toBeUndefined();
    expect(listUsers(db).map((u) => [u.username, u.role])).toEqual([['sofia', 'admin']]);
  });

  it('[M0.security/a] setup with the wrong code is refused and claims nothing', async () => {
    const { app, db } = await server();

    const res = await claim(app, 'not-the-code');

    expect(res.statusCode).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(listUsers(db)).toEqual([]);
    const status = await app.inject({ method: 'GET', url: '/setup' });
    expect(status.json()).toEqual({ configured: false });
  });

  it('[M0.security/a] an admin can run setup again to grant admin to another username', async () => {
    const { app, db, code } = await server();
    const admin = await claimedAdmin(app, code);
    memberCookie(db);

    const res = await app.inject({
      method: 'POST',
      url: '/setup',
      headers: signedIn(admin),
      payload: { username: 'kara' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ username: 'kara', role: 'admin' });
    const list = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: { cookie: admin },
    });
    expect(list.json()).toEqual({
      users: [
        { username: 'kara', role: 'admin' },
        { username: 'sofia', role: 'admin' },
      ],
    });
  });

  it('[M0.security/a] the setup code is written to a 0600 file and removed once claimed', async () => {
    const { app, code, setupCodeFile } = await server();
    expect(statSync(setupCodeFile).mode & 0o777).toBe(0o600);
    expect((await app.inject({ method: 'GET', url: '/setup' })).json()).toEqual({
      configured: false,
    });

    const res = await claim(app, code);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ username: 'sofia', role: 'admin' });
    expect(existsSync(setupCodeFile)).toBe(false);
    expect((await app.inject({ method: 'GET', url: '/setup' })).json()).toEqual({
      configured: true,
    });
  });
});

describe('roles', () => {
  it('[M0.security/b] every admin route rejects a signed-in non-admin user', async () => {
    const { app, db, code } = await server();
    await claimedAdmin(app, code);
    const member = memberCookie(db);

    const adminRoutes = routes.filter((r) => r.access === 'admin' || r.access === 'setup');
    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const r of adminRoutes) {
      const payload = bodyFor(r.method, r.path);
      const asMember = await app.inject({
        method: r.method,
        url: r.path,
        headers: signedIn(member),
        ...(payload ? { payload } : {}),
      });
      expect(asMember.statusCode, `${r.method} ${r.path} as a member`).toBe(403);
      expect(asMember.json()).toEqual({ error: 'forbidden' });

      const anonymous = await app.inject({
        method: r.method,
        url: r.path,
        ...(payload ? { payload } : {}),
      });
      expect(anonymous.statusCode, `${r.method} ${r.path} signed out`).toBe(401);
    }
  });

  it('[M0.security/b] every route declares its access, and only /health, GET /setup and sign-in are public', async () => {
    const { app, code } = await server();
    await claimedAdmin(app, code);

    for (const r of routes) {
      expect(['public', 'member', 'admin', 'setup'], `${r.method} ${r.path}`).toContain(r.access);
    }
    expect(routes.filter((r) => r.access === 'public').map((r) => `${r.method} ${r.path}`)).toEqual(
      ['GET /health', 'GET /setup', 'GET /auth/login', 'GET /auth/callback', 'POST /auth/token'],
    );
    for (const r of routes.filter((route) => route.access !== 'public')) {
      const payload = bodyFor(r.method, r.path);
      const res = await app.inject({
        method: r.method,
        url: r.path,
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, `${r.method} ${r.path} signed out`).toBe(401);
    }
  });
});

describe('routes without declared access', () => {
  it('[M0.security/b] the app refuses to register a route that declares no access', async () => {
    const { app } = await server();
    expect(() => app.get('/admin/secret', () => ({ leak: true }))).toThrow(/access/);
    expect(() =>
      app.route({ method: 'POST', url: '/also-secret', config: {}, handler: () => ({}) }),
    ).toThrow(/access/);
  });
});

describe('the session cookie and the proxy', () => {
  it('[M0.security/c] the session cookie is HttpOnly, Secure and SameSite=Lax', async () => {
    const { app, code } = await server({ trustProxy: [PROXY_IP] });

    const res = await claim(app, code, {
      remoteAddress: PROXY_IP,
      headers: { 'x-forwarded-proto': 'https', 'x-forwarded-for': CLIENT_IP },
    });

    expect(res.statusCode).toBe(200);
    const raw = String(res.headers['set-cookie']);
    expect(raw).toMatch(/;\s*HttpOnly/i);
    expect(raw).toMatch(/;\s*Secure/i);
    expect(raw).toMatch(/;\s*SameSite=Lax/i);
    const cookie = sessionCookieOf(res);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: THIRTY_DAYS_S,
    });
  });

  it('[M0.security/c] forwarded headers are ignored from an address that is not the proxy', async () => {
    const { app, code } = await server({ trustProxy: [PROXY_IP] });
    const forwarded = { 'x-forwarded-proto': 'https', 'x-forwarded-for': CLIENT_IP };

    const res = await claim(app, code, { remoteAddress: OTHER_IP, headers: forwarded });
    expect(res.statusCode).toBe(200);
    expect(sessionCookieOf(res).secure).toBeUndefined();

    const fromOther = await app.inject({
      method: 'GET',
      url: '/probe',
      remoteAddress: OTHER_IP,
      headers: forwarded,
    });
    expect(fromOther.json()).toEqual({ ip: OTHER_IP, protocol: 'http' });

    const fromProxy = await app.inject({
      method: 'GET',
      url: '/probe',
      remoteAddress: PROXY_IP,
      headers: forwarded,
    });
    expect(fromProxy.json()).toEqual({ ip: CLIENT_IP, protocol: 'https' });
  });

  it('[M0.security/c] a hostname proxy is re-resolved, and its old address is no longer trusted', async () => {
    let clock = 1_000_000;
    let address = PROXY_IP;
    const asked: string[] = [];
    const lookup: Lookup = (hostname) => {
      asked.push(hostname);
      return Promise.resolve([address]);
    };
    const { app } = await server({ trustProxy: ['proxy.example'], lookup, now: () => clock });
    const probe = (remoteAddress: string) =>
      app
        .inject({
          method: 'GET',
          url: '/probe',
          remoteAddress,
          headers: { 'x-forwarded-proto': 'https' },
        })
        .then((res) => res.json<{ protocol: string }>().protocol);

    expect(await probe(PROXY_IP)).toBe('https');

    // The proxy restarts on a new address; within a minute the old one is still believed.
    address = OTHER_IP;
    clock += 30_000;
    expect(await probe(PROXY_IP)).toBe('https');
    expect(asked).toEqual(['proxy.example']);

    clock += 31_000;
    expect(await probe(PROXY_IP)).toBe('http');
    expect(await probe(OTHER_IP)).toBe('https');
    expect(asked).toEqual(['proxy.example', 'proxy.example']);
  });

  it('[M0.security/c] a hostname proxy that stops resolving is no longer trusted until it resolves again', async () => {
    let clock = 1_000_000;
    let failing = false;
    const warnings: string[] = [];
    const proxy = createProxyTrust(['proxy.example'], {
      now: () => clock,
      lookup: () =>
        failing ? Promise.reject(new Error('ENOTFOUND')) : Promise.resolve([PROXY_IP]),
      warn: (message) => warnings.push(message),
    });
    await proxy.refresh();
    expect(proxy.trust(PROXY_IP, 0)).toBe(true);

    failing = true;
    clock += 61_000;
    await proxy.refreshIfStale();
    expect(proxy.trust(PROXY_IP, 0)).toBe(false);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('proxy.example');

    failing = false;
    clock += 61_000;
    await proxy.refreshIfStale();
    expect(proxy.trust(PROXY_IP, 0)).toBe(true);
  });

  it('[M0.security/c] plain HTTP sign-in works with COOKIE_SECURE=auto', async () => {
    const { app, code } = await server({ cookieSecure: 'auto' });

    const res = await claim(app, code, { remoteAddress: OTHER_IP });
    const cookie = sessionCookieOf(res);
    expect(cookie.secure).toBeUndefined();
    expect(cookie.httpOnly).toBe(true);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      remoteAddress: OTHER_IP,
      headers: { cookie: cookieHeader(cookie.value) },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'sofia', role: 'admin' });
  });

  it('marks the cookie Secure even over plain HTTP when COOKIE_SECURE=true', async () => {
    const { app, code } = await server({ cookieSecure: true });
    const res = await claim(app, code);
    expect(sessionCookieOf(res).secure).toBe(true);
  });
});

describe('signed-in writes from another site', () => {
  const PUBLIC = 'https://audio.example.org';

  it('refuses a signed-in write whose Origin is not the public origin', async () => {
    const { app, db, code } = await server({ publicOrigin: PUBLIC });
    const admin = await claimedAdmin(app, code);

    const res = await app.inject({
      method: 'POST',
      url: '/setup',
      headers: signedIn(admin, 'https://elsewhere.example'),
      payload: { username: 'mallory' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'cross_origin' });
    expect(listUsers(db).map((u) => u.username)).toEqual(['sofia']);

    const allowed = await app.inject({
      method: 'POST',
      url: '/setup',
      headers: signedIn(admin, PUBLIC),
      payload: { username: 'kara' },
    });
    expect(allowed.statusCode).toBe(200);
  });

  it('falls back to the Referer without an Origin, and refuses a write with neither', async () => {
    const { app, code } = await server({ publicOrigin: PUBLIC });
    const admin = await claimedAdmin(app, code);
    const grant = (headers: Record<string, string>) =>
      app.inject({ method: 'POST', url: '/setup', headers, payload: { username: 'kara' } });

    expect((await grant({ cookie: admin, referer: `${PUBLIC}/settings` })).statusCode).toBe(200);
    expect(
      (await grant({ cookie: admin, referer: 'https://elsewhere.example/page' })).statusCode,
    ).toBe(403);
    expect((await grant({ cookie: admin })).statusCode).toBe(403);
  });

  it("allows the request's own origin when no public origin is configured", async () => {
    const { app, code } = await server();
    const admin = await claimedAdmin(app, code);
    const grant = (host: string, origin: string) =>
      app.inject({
        method: 'POST',
        url: '/setup',
        headers: { cookie: admin, host, origin },
        payload: { username: 'kara' },
      });

    expect((await grant('192.0.2.50:5173', 'http://192.0.2.50:5173')).statusCode).toBe(200);
    expect((await grant('192.0.2.50:5173', 'http://192.0.2.51:5173')).statusCode).toBe(403);
  });

  it('checks neither reads nor requests without the session cookie', async () => {
    const { app, code } = await server({ publicOrigin: PUBLIC });
    const claimed = await claim(app, code, { headers: { origin: 'https://elsewhere.example' } });
    expect(claimed.statusCode).toBe(200);
    const admin = cookieHeader(sessionCookieOf(claimed).value);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: signedIn(admin, 'https://elsewhere.example'),
    });
    expect(me.statusCode).toBe(200);
  });
});

describe('signing out', () => {
  it('deletes the session and clears the cookie', async () => {
    const { app, code } = await server();
    const admin = await claimedAdmin(app, code);

    const res = await app.inject({ method: 'POST', url: '/auth/logout', headers: signedIn(admin) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sessionCookieOf(res).value).toBe('');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: admin } });
    expect(me.statusCode).toBe(401);
  });
});
