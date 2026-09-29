/**
 * Devices, through the real routes. The sign-on is a stand-in that answers with a fixed identity
 * per code: what the ID token check does is the recorded test's job, not this one's.
 */
import { DEVICE_COOKIE, LOGIN_COOKIE, SESSION_COOKIE } from '@auralis/schema';
import { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { type Identity, type SignOn, SignOnError } from './auth/oidc.js';
import { openDatabase } from './store/connection.js';
import { s256 } from './store/signIn.js';

const ISSUER = 'https://upstream.invalid';
const ORIGIN = 'http://localhost';
const VERIFIER = 'app-verifier-0123456789-0123456789-0123456789';

const people: Record<string, Identity> = {
  kara: { issuer: ISSUER, sub: 'sub-kara', username: 'kara', groups: ['household'] },
  otto: { issuer: ISSUER, sub: 'sub-otto', username: 'otto', groups: ['household'] },
  guest: { issuer: ISSUER, sub: 'sub-guest', username: 'guest', groups: ['visitors'] },
};

const standIn: SignOn = {
  async authorizationUrl({ state }) {
    return `${ISSUER}/authorize?state=${encodeURIComponent(state)}`;
  },
  async complete(code) {
    const who = people[code];
    if (who === undefined) throw new SignOnError('bad_token', 'unknown code');
    return who;
  },
};

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function server() {
  const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:'), signOn: standIn });
  apps.push(app);
  return app;
}

function cookieOf(res: LightMyRequestResponse, name: string): string | undefined {
  return res.cookies.find((c) => c.name === name)?.value;
}

function stateOf(res: LightMyRequestResponse): string {
  expect(res.statusCode).toBe(302);
  return new URL(String(res.headers.location)).searchParams.get('state') ?? '';
}

/** A web sign-in started in one browser: its state, and the cookie that binds it there. */
async function startWeb(app: FastifyInstance, query = '') {
  const res = await app.inject({ url: `/api/auth/login${query}` });
  const binding = cookieOf(res, LOGIN_COOKIE);
  expect(binding).toBeDefined();
  return { state: stateOf(res), cookie: `${LOGIN_COOKIE}=${String(binding)}` };
}

function callback(
  app: FastifyInstance,
  code: string,
  started: { state: string; cookie: string },
  more?: string,
) {
  return app.inject({
    url: `/api/auth/callback?code=${code}&state=${encodeURIComponent(started.state)}`,
    headers: { cookie: more ? `${started.cookie}; ${more}` : started.cookie },
  });
}

async function webSignIn(app: FastifyInstance, who: string, deviceCookie?: string) {
  const started = await startWeb(app, '?return_to=/library');
  const res = await callback(
    app,
    who,
    started,
    deviceCookie ? `${DEVICE_COOKIE}=${deviceCookie}` : undefined,
  );
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/library');
  return {
    session: cookieOf(res, SESSION_COOKIE) as string,
    device: cookieOf(res, DEVICE_COOKIE) as string,
  };
}

async function appSignIn(app: FastifyInstance, who: string) {
  const login = await app.inject({
    url: `/api/auth/login?client=android&code_challenge=${s256(VERIFIER)}`,
  });
  const res = await app.inject({
    url: `/api/auth/callback?code=${who}&state=${encodeURIComponent(stateOf(login))}`,
  });
  expect(res.statusCode).toBe(302);
  const location = new URL(String(res.headers.location));
  expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(
    'auralis://auth/callback',
  );
  const swap = await app.inject({
    method: 'POST',
    url: '/api/auth/token',
    payload: { code: location.searchParams.get('code'), codeVerifier: VERIFIER },
  });
  expect(swap.statusCode).toBe(200);
  return swap.json() as { token: string; deviceId: string; expiresAt: number };
}

const withCookie = (session: string) => ({
  cookie: `${SESSION_COOKIE}=${session}`,
  origin: ORIGIN,
});
const withBearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('[M0.sso/b] one user on two devices', () => {
  it('signs in on the web and on Android as two devices, each with its own id and session', async () => {
    const app = await server();
    const web = await webSignIn(app, 'kara');
    const android = await appSignIn(app, 'kara');
    expect(web.device).not.toBe(android.deviceId);

    const onWeb = await app.inject({ url: '/api/auth/me', headers: withCookie(web.session) });
    const onApp = await app.inject({ url: '/api/auth/me', headers: withBearer(android.token) });
    expect(onWeb.json()).toMatchObject({ username: 'kara', deviceId: web.device });
    expect(onApp.json()).toMatchObject({ username: 'kara', deviceId: android.deviceId });

    const list = await app.inject({ url: '/api/devices', headers: withBearer(android.token) });
    expect(list.json().devices).toEqual([
      expect.objectContaining({ id: web.device, kind: 'web', current: false }),
      expect.objectContaining({ id: android.deviceId, kind: 'android', current: true }),
    ]);
  });

  it('reuses the web device when the browser signs in again with its device cookie', async () => {
    const app = await server();
    const first = await webSignIn(app, 'kara');
    const again = await webSignIn(app, 'kara', first.device);
    expect(again.device).toBe(first.device);
    expect(again.session).not.toBe(first.session);
  });

  it("never reuses another user's device id from a cookie", async () => {
    const app = await server();
    const kara = await webSignIn(app, 'kara');
    const otto = await webSignIn(app, 'otto', kara.device);
    expect(otto.device).not.toBe(kara.device);
  });

  it('removing a device ends only its session', async () => {
    const app = await server();
    const web = await webSignIn(app, 'kara');
    const android = await appSignIn(app, 'kara');
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/devices/${android.deviceId}`,
      headers: withCookie(web.session),
    });
    expect(removed.statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: withBearer(android.token) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/api/auth/me', headers: withCookie(web.session) })).statusCode,
    ).toBe(200);
  });

  it("answers 404 for another user's device, and leaves it alone", async () => {
    const app = await server();
    const kara = await webSignIn(app, 'kara');
    const otto = await appSignIn(app, 'otto');
    for (const method of ['DELETE', 'PATCH'] as const) {
      const res = await app.inject({
        method,
        url: `/api/devices/${otto.deviceId}`,
        headers: withCookie(kara.session),
        ...(method === 'PATCH' ? { payload: { name: 'mine now' } } : {}),
      });
      expect(res.statusCode).toBe(404);
    }
    expect(
      (await app.inject({ url: '/api/auth/me', headers: withBearer(otto.token) })).statusCode,
    ).toBe(200);
  });

  it('renames a device', async () => {
    const app = await server();
    const android = await appSignIn(app, 'kara');
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/devices/${android.deviceId}`,
      headers: withBearer(android.token),
      payload: { name: 'Phone' },
    });
    expect(res.json()).toMatchObject({ id: android.deviceId, name: 'Phone', current: true });
  });
});

describe('[M0.sso/b] signing in', () => {
  it('refuses a state that was already used, or never issued', async () => {
    const app = await server();
    const started = await startWeb(app);
    expect((await callback(app, 'kara', started)).statusCode).toBe(302);
    const replay = await callback(app, 'kara', started);
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual({ error: 'bad_state' });
    expect(
      (await app.inject({ url: '/api/auth/callback?code=kara&state=made-up' })).statusCode,
    ).toBe(400);
  });

  it('refuses someone outside the household, and makes no user for them', async () => {
    const app = await server();
    const res = await callback(app, 'guest', await startWeb(app));
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_household' });
    expect(cookieOf(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('refuses a token the sign-on check rejects with 400 and no session', async () => {
    const app = await server();
    const res = await callback(app, 'forged', await startWeb(app));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_token' });
    expect(cookieOf(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('sends the browser back only to a path on this site', async () => {
    const elsewhere = [
      'https://elsewhere.invalid/',
      '//elsewhere.invalid/',
      '/\\x',
      '/\\elsewhere.invalid/',
      '/library\\x',
      '/\t/elsewhere.invalid/',
      '/library\nSet-Cookie: x=1',
      '/library\r\nLocation: https://elsewhere.invalid/',
      '/ library',
      '/library\u0000',
      '/library\u2028',
      'library',
      '',
    ];
    for (const target of elsewhere) {
      const app = await server();
      const started = await startWeb(app, `?return_to=${encodeURIComponent(target)}`);
      const res = await callback(app, 'kara', started);
      expect(res.statusCode, JSON.stringify(target)).toBe(302);
      expect(res.headers.location, JSON.stringify(target)).toBe('/');
    }
  });

  it('keeps a path on this site with its query and fragment', async () => {
    const app = await server();
    const started = await startWeb(
      app,
      `?return_to=${encodeURIComponent('/library/item?tab=chapters#now')}`,
    );
    const res = await callback(app, 'kara', started);
    expect(res.headers.location).toBe('/library/item?tab=chapters#now');
  });

  it('binds a web sign-in to its browser with a short-lived HttpOnly, SameSite=Lax cookie', async () => {
    const app = await server();
    const res = await app.inject({ url: '/api/auth/login' });
    const binding = res.cookies.find((c) => c.name === LOGIN_COOKIE);
    expect(binding).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
    expect(binding?.maxAge).toBeGreaterThan(0);
    expect(binding?.maxAge).toBeLessThanOrEqual(10 * 60);
    expect(binding?.value).not.toContain(stateOf(res));
  });

  it("refuses the attacker's own code and state finished in someone else's browser", async () => {
    const app = await server();
    const attacker = await startWeb(app);
    const victim = await startWeb(app);
    for (const cookie of [undefined, victim.cookie]) {
      const res = await app.inject({
        url: `/api/auth/callback?code=otto&state=${encodeURIComponent(attacker.state)}`,
        ...(cookie ? { headers: { cookie } } : {}),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'bad_state' });
      expect(cookieOf(res, SESSION_COOKIE)).toBeUndefined();
    }
  });

  it('refuses a state swapped between two browsers', async () => {
    const app = await server();
    const one = await startWeb(app);
    const two = await startWeb(app);
    const swapped = await callback(app, 'kara', { state: two.state, cookie: one.cookie });
    expect(swapped.statusCode).toBe(400);
    expect(cookieOf(swapped, SESSION_COOKIE)).toBeUndefined();
  });

  it('clears the binding cookie once the sign-in finishes', async () => {
    const app = await server();
    const res = await callback(app, 'kara', await startWeb(app));
    expect(res.statusCode).toBe(302);
    const cleared = res.cookies.find((c) => c.name === LOGIN_COOKIE);
    expect(cleared?.value).toBe('');
  });

  it('needs the app to send a PKCE challenge, and its verifier to swap the code', async () => {
    const app = await server();
    expect((await app.inject({ url: '/api/auth/login?client=android' })).statusCode).toBe(400);
    const login = await app.inject({
      url: `/api/auth/login?client=android&code_challenge=${s256(VERIFIER)}`,
    });
    const back = await app.inject({ url: `/api/auth/callback?code=kara&state=${stateOf(login)}` });
    const code = new URL(String(back.headers.location)).searchParams.get('code');
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/token',
      payload: { code, codeVerifier: 'x'.repeat(43) },
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toEqual({ error: 'bad_code' });
  });

  it('refuses a request carrying both a cookie and a bearer token', async () => {
    const app = await server();
    const web = await webSignIn(app, 'kara');
    const android = await appSignIn(app, 'kara');
    const res = await app.inject({
      url: '/api/auth/me',
      headers: { ...withCookie(web.session), ...withBearer(android.token) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'ambiguous_credentials' });
  });

  it('refuses a session cookie value sent as a bearer token', async () => {
    const app = await server();
    const web = await webSignIn(app, 'kara');
    expect(
      (await app.inject({ url: '/api/auth/me', headers: withBearer(web.session) })).statusCode,
    ).toBe(401);
  });

  it('slows down one address after twenty attempts in ten minutes', async () => {
    const app = await server();
    for (let i = 0; i < 20; i += 1) {
      expect((await app.inject({ url: '/api/auth/login' })).statusCode).toBe(302);
    }
    const limited = await app.inject({ url: '/api/auth/callback?state=x&code=y' });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('answers 404 on every sign-in route when no sign-on is configured', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    apps.push(app);
    const res = await app.inject({ url: '/api/auth/login' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'sign_on_off' });
  });
});
