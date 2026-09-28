/**
 * Signing in through the recorded household sign-on, end to end through the real routes: the
 * sign-on's `oidc/recordings/{discovery,jwks,token,userinfo}.json`, Audiobookshelf's
 * `audiobookshelf/recordings/{users-list,api-key-create}.json` and Jellyfin's
 * `jellyfin/recordings/{users-list,quick-connect-initiate,quick-connect-authorize,
 * quick-connect-authenticate}.json`, replayed with the recorder's saved state, nonce, verifier
 * and time (`oidc/sign-in.json`).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGIN_COOKIE, SESSION_COOKIE } from '@auralis/schema';
import { type FastifyInstance, type LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { AbsProvisioner } from './adapters/audiobookshelf/provision.js';
import { type FetchLike } from './adapters/http/fetch.js';
import { type Recording, recordingSchema } from './adapters/http/recording.js';
import { replayFetch } from './adapters/http/replay.js';
import { PLACEHOLDER, PLACEHOLDER_ORIGIN } from './adapters/http/scrub.js';
import { decodePart, signWithTestKey } from './adapters/http/testSigningKey.js';
import { JellyfinProvisioner } from './adapters/jellyfin/quickConnect.js';
import { buildApp } from './app.js';
import { OidcClient } from './auth/oidc.js';
import { openDatabase } from './store/connection.js';
import { listLinks, readToken } from './store/upstreamLinks.js';
import { listUsers } from './store/users.js';
import { Linker } from './upstream/links.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
const read = (...path: string[]): unknown =>
  JSON.parse(readFileSync(join(adapters, ...path), 'utf8'));
const recording = (upstream: string, call: string): Recording =>
  recordingSchema.parse(read(upstream, 'recordings', `${call}.json`));

const signIn = read('oidc', 'sign-in.json') as {
  state: string;
  nonce: string;
  verifier: string;
  now: number;
  clientId: string;
  redirectUri: string;
};
const oidc = ['discovery', 'jwks', 'token', 'userinfo'].map((c) => recording('oidc', c));
const absUsers = recording('audiobookshelf', 'users-list');
const absKey = recording('audiobookshelf', 'api-key-create');
const jfCalls = [
  'users-list',
  'quick-connect-initiate',
  'quick-connect-authorize',
  'quick-connect-authenticate',
].map((c) => recording('jellyfin', c));

const json = (r: Recording) => (r.response.body as { json: unknown }).json;
const [, , tokenRecording, userinfoRecording] = oidc as [
  Recording,
  Recording,
  Recording,
  Recording,
];
const recordedIdToken = (json(tokenRecording) as { id_token: string }).id_token;
const recordedSub = (json(userinfoRecording) as { sub: string }).sub;
const recordedAbsId = (json(absKey) as { apiKey: { userId: string } }).apiKey.userId;
const recordedAbsToken = (json(absKey) as { apiKey: { apiKey: string } }).apiKey.apiKey;
const jfAuth = json(jfCalls[3] as Recording) as { AccessToken: string; User: { Id: string } };

const KEY = Buffer.alloc(32, 7);

/** The recorded state, nonce and verifier first, in the order login draws them; then fresh bytes. */
function recordedRandom() {
  const queue = [signIn.state, signIn.nonce, signIn.verifier].map((v) =>
    Buffer.from(v, 'base64url'),
  );
  return (bytes: number) => queue.shift() ?? randomBytes(bytes);
}

/** The recorded token exchange, its ID token swapped for one with some claims changed. */
function withIdToken(change: Record<string, unknown>): Recording[] {
  const [header, payload] = recordedIdToken.split('.') as [string, string];
  const token = structuredClone(tokenRecording);
  (json(token) as { id_token: string }).id_token = signWithTestKey(decodePart(header), {
    ...(decodePart(payload) as Record<string, unknown>),
    ...change,
  });
  return oidc.map((r) => (r === tokenRecording ? token : r));
}

let apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
});

async function world(signOnRecordings: Recording[] = oidc) {
  const db = openDatabase(':memory:');
  const asked: string[] = [];
  const counting =
    (fetch: FetchLike): FetchLike =>
    (url, init) => {
      asked.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      return fetch(url, init);
    };
  const linker = new Linker({
    db,
    key: KEY,
    now: () => signIn.now,
    provisioners: [
      new AbsProvisioner({
        baseUrl: PLACEHOLDER_ORIGIN,
        provisionKey: PLACEHOLDER,
        fetch: counting(replayFetch([absUsers, absKey])),
      }),
      new JellyfinProvisioner({
        baseUrl: PLACEHOLDER_ORIGIN,
        apiKey: PLACEHOLDER,
        fetch: counting(replayFetch(jfCalls)),
      }),
    ],
  });
  const signOn = new OidcClient({
    issuer: PLACEHOLDER_ORIGIN,
    clientId: signIn.clientId,
    clientSecret: PLACEHOLDER,
    redirectUri: signIn.redirectUri,
    fetch: replayFetch(signOnRecordings),
    now: () => signIn.now,
  });
  const app = await buildApp({
    webDistDir: null,
    db,
    signOn,
    linker,
    random: recordedRandom(),
    now: () => signIn.now,
  });
  apps.push(app);
  return { app, db, asked };
}

function cookieOf(res: LightMyRequestResponse, name: string): string | undefined {
  return res.cookies.find((c) => c.name === name)?.value;
}

/** `/auth/login` in one browser; the callback comes back to it with the recorded code. */
async function login(app: FastifyInstance) {
  const res = await app.inject({ url: '/auth/login' });
  expect(res.statusCode).toBe(302);
  const state = new URL(String(res.headers.location)).searchParams.get('state') ?? '';
  const cookie = `${LOGIN_COOKIE}=${String(cookieOf(res, LOGIN_COOKIE))}`;
  const callback = () =>
    app.inject({
      url: `/auth/callback?code=recorded-code&state=${encodeURIComponent(state)}`,
      headers: { cookie },
    });
  return { res, state, callback };
}

describe('[M0.sso/a] signing in through the recorded sign-on', () => {
  it('redirects to the sign-on with the recorded state, sets a cookie at the callback, and /auth/me is the test identity', async () => {
    const { app } = await world();
    const { res, state, callback } = await login(app);
    const location = new URL(String(res.headers.location));
    expect(`${location.origin}${location.pathname}`).toBe(
      `${PLACEHOLDER_ORIGIN}/api/oidc/authorization`,
    );
    expect(state).toBe(signIn.state);
    expect(location.searchParams.get('nonce')).toBe(signIn.nonce);

    const back = await callback();
    expect(back.statusCode).toBe(302);
    const session = cookieOf(back, SESSION_COOKIE);
    expect(session).toBeDefined();

    const me = await app.inject({
      url: '/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=${String(session)}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: 'auralis' });
  });

  it('links the recorded Audiobookshelf and Jellyfin user ids, whose tokens decrypt to the recorded ones', async () => {
    const { app, db, asked } = await world();
    expect((await (await login(app)).callback()).statusCode).toBe(302);

    const [user] = listUsers(db);
    expect(user?.username).toBe('auralis');
    const links = listLinks(db, user!.id);
    expect(links.map((l) => [l.service, l.state, l.upstreamUserId])).toEqual([
      ['abs', 'linked', recordedAbsId],
      ['jellyfin', 'linked', jfAuth.User.Id],
    ]);
    // A service identity outside the household is linked to the account it has, never given one.
    expect(links.every((l) => !l.createdByAuralis)).toBe(true);
    expect(readToken(db, KEY, user!.id, 'abs')).toBe(recordedAbsToken);
    expect(readToken(db, KEY, user!.id, 'jellyfin')).toBe(jfAuth.AccessToken);

    // The Audiobookshelf key and the Jellyfin token were minted with the recorded answers.
    expect(asked).toEqual([
      'GET /api/users',
      'POST /api/api-keys',
      'GET /Users',
      'POST /QuickConnect/Initiate',
      'POST /QuickConnect/Authorize',
      'POST /Users/AuthenticateWithQuickConnect',
    ]);
  });

  it('refuses a reused state with 400, and makes no second session', async () => {
    const { app, db } = await world();
    const { callback } = await login(app);
    expect((await callback()).statusCode).toBe(302);
    const again = await callback();
    expect(again.statusCode).toBe(400);
    expect(cookieOf(again, SESSION_COOKIE)).toBeUndefined();
    expect(listUsers(db)).toHaveLength(1);
  });

  it.each([
    ['another nonce', { nonce: 'not-the-recorded-nonce' }],
    ['another audience', { aud: ['someone-else'] }],
    ['another issuer', { iss: 'https://elsewhere.invalid' }],
  ])(
    'refuses the recorded ID token re-signed with %s with 400, and makes no user',
    async (_what, change) => {
      const { app, db, asked } = await world(withIdToken(change));
      const back = await (await login(app)).callback();
      expect(back.statusCode).toBe(400);
      expect(cookieOf(back, SESSION_COOKIE)).toBeUndefined();
      expect(listUsers(db)).toEqual([]);
      expect(asked).toEqual([]);
    },
  );

  it('the replayed sign-on is the recorded subject', () => {
    const claims = decodePart(recordedIdToken.split('.')[1] as string) as { sub: string };
    expect(claims.sub).toBe(recordedSub);
  });
});
