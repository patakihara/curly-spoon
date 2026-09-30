/**
 * A signed-out visitor opening a page of the web app is sent to sign in first, keeping where they
 * were going. Signing in and first-run setup are the pages open to everyone.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LOGIN_COOKIE, SESSION_COOKIE } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, OPEN_PAGES } from './app.js';
import { type SignOn } from './auth/oidc.js';
import { openDatabase } from './store/connection.js';

const standIn: SignOn = {
  async authorizationUrl({ state }) {
    return `https://sign-on.invalid/authorize?state=${encodeURIComponent(state)}`;
  },
  async complete() {
    return {
      issuer: 'https://sign-on.invalid',
      sub: 'sub-kara',
      username: 'kara',
      groups: ['household'],
    };
  },
};

let dist: string | undefined;
let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (dist !== undefined) rmSync(dist, { recursive: true, force: true });
  dist = undefined;
});

async function serving(signOn: SignOn | null) {
  dist = mkdtempSync(join(tmpdir(), 'auralis-web-'));
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Auralis</title>');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), '');
  app = await buildApp({ webDistDir: dist, db: openDatabase(':memory:'), signOn });
  return app;
}

const page = (server: FastifyInstance, url: string, cookie?: string) =>
  server.inject({
    method: 'GET',
    url,
    headers: { accept: 'text/html', ...(cookie === undefined ? {} : { cookie }) },
  });

async function signedIn(server: FastifyInstance): Promise<string> {
  const login = await server.inject({ url: '/api/auth/login' });
  const binding = login.cookies.find((c) => c.name === LOGIN_COOKIE)!.value;
  const state = new URL(String(login.headers.location)).searchParams.get('state')!;
  const back = await server.inject({
    url: `/api/auth/callback?code=kara&state=${encodeURIComponent(state)}`,
    headers: { cookie: `${LOGIN_COOKIE}=${binding}` },
  });
  return `${SESSION_COOKIE}=${back.cookies.find((c) => c.name === SESSION_COOKIE)!.value}`;
}

describe('[M0.sso/d] a signed-out visitor', () => {
  it('opening a page is sent to sign in, keeping where they were going', async () => {
    const server = await serving(standIn);
    const res = await page(server, '/books/x?sort=new');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/sign-in?return_to=%2Fbooks%2Fx%3Fsort%3Dnew');
    const home = await page(server, '/');
    expect(home.statusCode).toBe(302);
    expect(home.headers.location).toBe('/sign-in?return_to=%2F');
  });

  it('can open signing in and first-run setup, the pages open to everyone', async () => {
    const server = await serving(standIn);
    for (const url of ['/sign-in', '/sign-in?error=not_household&return_to=%2Fbooks', '/setup']) {
      const res = await page(server, url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('<title>Auralis</title>');
    }
  });

  it('still gets the app’s files and the API’s own answers', async () => {
    const server = await serving(standIn);
    expect((await server.inject({ url: '/assets/app-abc123.js' })).statusCode).toBe(200);
    const me = await page(server, '/api/auth/me');
    expect(me.statusCode).toBe(401);
    expect(me.json()).toEqual({ error: 'unauthenticated' });
  });

  it('once signed in, opens the page itself', async () => {
    const server = await serving(standIn);
    const cookie = await signedIn(server);
    for (const url of ['/', '/books/x?sort=new']) {
      const res = await page(server, url, cookie);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('<title>Auralis</title>');
    }
  });

  it('on a server with no sign-on, where nobody can sign in, gets the page', async () => {
    const server = await serving(null);
    expect((await page(server, '/books/x')).statusCode).toBe(200);
  });

  it('the pages open to everyone are the bare pages of nav.json', () => {
    const nav = JSON.parse(
      readFileSync(new URL('../../design/app/nav.json', import.meta.url), 'utf8'),
    ) as { pages: { route: string; presentation: string }[] };
    const bare = nav.pages.filter((p) => p.presentation === 'bare').map((p) => p.route);
    expect([...OPEN_PAGES].sort()).toEqual(bare.sort());
  });
});
