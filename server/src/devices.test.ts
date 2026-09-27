/**
 * Devices, through the real routes. The sign-on is a stand-in that answers with a fixed identity
 * per code: what the ID token check does is the recorded test's job, not this one's.
 */
import { DEVICE_COOKIE, SESSION_COOKIE } from '@auralis/schema';
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

async function webSignIn(app: FastifyInstance, who: string, deviceCookie?: string) {
  const cookie = deviceCookie ? `${DEVICE_COOKIE}=${deviceCookie}` : undefined;
  const state = stateOf(await app.inject({ url: '/auth/login?return_to=/library' }));
  const res = await app.inject({
    url: `/auth/callback?code=${who}&state=${encodeURIComponent(state)}`,
    ...(cookie ? { headers: { cookie } } : {}),
  });
  expect(res.statusCode).toBe(302);
  expect(res.headers.location).toBe('/library');
  return {
    session: cookieOf(res, SESSION_COOKIE) as string,
    device: cookieOf(res, DEVICE_COOKIE) as string,
  };
}

async function appSignIn(app: FastifyInstance, who: string) {
  const login = await app.inject({
    url: `/auth/login?client=android&code_challenge=${s256(VERIFIER)}`,
  });
  const res = await app.inject({
    url: `/auth/callback?code=${who}&state=${encodeURIComponent(stateOf(login))}`,
  });
  expect(res.statusCode).toBe(302);
  const location = new URL(String(res.headers.location));
  expect(`${location.protocol}//${location.host}${location.pathname}`).toBe(
    'auralis://auth/callback',
  );
  const swap = await app.inject({
    method: 'POST',
    url: '/auth/token',
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

    const onWeb = await app.inject({ url: '/auth/me', headers: withCookie(web.session) });
    const onApp = await app.inject({ url: '/auth/me', headers: withBearer(android.token) });
    expect(onWeb.json()).toMatchObject({ username: 'kara', deviceId: web.device });
    expect(onApp.json()).toMatchObject({ username: 'kara', deviceId: android.deviceId });

    const list = await app.inject({ url: '/devices', headers: withBearer(android.token) });
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
      url: `/devices/${android.deviceId}`,
      headers: withCookie(web.session),
    });
    expect(removed.statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/auth/me', headers: withBearer(android.token) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: '/auth/me', headers: withCookie(web.session) })).statusCode,
    ).toBe(200);
  });

  it("answers 404 for another user's device, and leaves it alone", async () => {
    const app = await server();
    const kara = await webSignIn(app, 'kara');
    const otto = await appSignIn(app, 'otto');
    for (const method of ['DELETE', 'PATCH'] as const) {
      const res = await app.inject({
        method,
        url: `/devices/${otto.deviceId}`,
        headers: withCookie(kara.session),
        ...(method === 'PATCH' ? { payload: { name: 'mine now' } } : {}),
      });
      expect(res.statusCode).toBe(404);
    }
    expect(
      (await app.inject({ url: '/auth/me', headers: withBearer(otto.token) })).statusCode,
    ).toBe(200);
  });

  it('renames a device', async () => {
    const app = await server();
    const android = await appSignIn(app, 'kara');
    const res = await app.inject({
      method: 'PATCH',
      url: `/devices/${android.deviceId}`,
      headers: withBearer(android.token),
      payload: { name: 'Phone' },
    });
    expect(res.json()).toMatchObject({ id: android.deviceId, name: 'Phone', current: true });
  });
});

describe('[M0.sso/b] signing in', () => {
  it('refuses a state that was already used, or never issued', async () => {
    const app = await server();
    const state = stateOf(await app.inject({ url: '/auth/login' }));
    const url = `/auth/callback?code=kara&state=${encodeURIComponent(state)}`;
    expect((await app.inject({ url })).statusCode).toBe(302);
    const replay = await app.inject({ url });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toEqual({ error: 'bad_state' });
    expect((await app.inject({ url: '/auth/callback?code=kara&state=made-up' })).statusCode).toBe(
      400,
    );
  });

  it('refuses someone outside the household, and makes no user for them', async () => {
    const app = await server();
    const state = stateOf(await app.inject({ url: '/auth/login' }));
    const res = await app.inject({ url: `/auth/callback?code=guest&state=${state}` });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'not_household' });
    expect(cookieOf(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('refuses a token the sign-on check rejects with 400 and no session', async () => {
    const app = await server();
    const state = stateOf(await app.inject({ url: '/auth/login' }));
    const res = await app.inject({ url: `/auth/callback?code=forged&state=${state}` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_token' });
    expect(cookieOf(res, SESSION_COOKIE)).toBeUndefined();
  });

  it('sends the browser back only to a path on this site', async () => {
    const app = await server();
    for (const target of ['https://elsewhere.invalid/', '//elsewhere.invalid/', '/\\x']) {
      const state = stateOf(
        await app.inject({ url: `/auth/login?return_to=${encodeURIComponent(target)}` }),
      );
      const res = await app.inject({ url: `/auth/callback?code=kara&state=${state}` });
      expect(res.headers.location).toBe('/');
    }
  });

  it('needs the app to send a PKCE challenge, and its verifier to swap the code', async () => {
    const app = await server();
    expect((await app.inject({ url: '/auth/login?client=android' })).statusCode).toBe(400);
    const login = await app.inject({
      url: `/auth/login?client=android&code_challenge=${s256(VERIFIER)}`,
    });
    const back = await app.inject({ url: `/auth/callback?code=kara&state=${stateOf(login)}` });
    const code = new URL(String(back.headers.location)).searchParams.get('code');
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/token',
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
      url: '/auth/me',
      headers: { ...withCookie(web.session), ...withBearer(android.token) },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'ambiguous_credentials' });
  });

  it('refuses a session cookie value sent as a bearer token', async () => {
    const app = await server();
    const web = await webSignIn(app, 'kara');
    expect(
      (await app.inject({ url: '/auth/me', headers: withBearer(web.session) })).statusCode,
    ).toBe(401);
  });

  it('slows down one address after twenty attempts in ten minutes', async () => {
    const app = await server();
    for (let i = 0; i < 20; i += 1) {
      expect((await app.inject({ url: '/auth/login' })).statusCode).toBe(302);
    }
    const limited = await app.inject({ url: '/auth/callback?state=x&code=y' });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('answers 404 on every sign-in route when no sign-on is configured', async () => {
    const app = await buildApp({ webDistDir: null, db: openDatabase(':memory:') });
    apps.push(app);
    const res = await app.inject({ url: '/auth/login' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'sign_on_off' });
  });
});
