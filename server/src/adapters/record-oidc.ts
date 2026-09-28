/**
 * Record mode's `oidc` part: one real sign-in as the service identity `auralis`, and the links
 * Auralis makes for it. Recorded: the sign-on's discovery, signing keys, token and userinfo;
 * Audiobookshelf's user list and key mint; Jellyfin's user list and the three Quick Connect calls.
 * The browser leg is scripted, not recorded: the first factor as `auralis`, then the
 * authorization request with that cookie, whose 302 carries the code (to the loopback redirect,
 * never followed). The state, nonce, verifier and time are saved so the test can replay them.
 * Whatever fails, the minted ABS key is deleted and the minted Jellyfin token logged out.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { OidcClient } from '../auth/oidc.js';
import { AbsProvisioner } from './audiobookshelf/provision.js';
import { AbsClient } from './audiobookshelf/client.js';
import { anonymizeAccounts } from './http/accounts.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { resignExchange } from './http/resign.js';
import { type RawExchange } from './http/scrub.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';

/** The service identity every upstream knows, and nobody else. */
export const TEST_IDENTITY = 'auralis';
/** The loopback redirect the sign-on allows for recording; nothing listens there. */
export const RECORD_REDIRECT_URI = 'http://127.0.0.1:8787/auth/callback';
/** The Auralis user id the recording links, so the Jellyfin device id is fixed. */
export const RECORD_USER_ID = 'recorder';

export interface OidcRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  issuer: string;
  oidcVersion: string;
  absUrl: string;
  jellyfinUrl: string;
  keys: {
    clientSecret: string;
    password: string;
    absProvisionKey: string;
    jellyfinApiKey: string;
  };
  random?: (bytes: number) => Buffer;
  now?: () => number;
}

/** Everything about the sign-in the test must replay, none of it secret once used. */
export interface SignInFixture {
  state: string;
  nonce: string;
  verifier: string;
  now: number;
  clientId: string;
  redirectUri: string;
}

function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  const pair = header.split(';')[0] ?? '';
  if (!pair.includes('=')) throw new Error('the first factor set no session cookie');
  return pair;
}

/** The scripted browser leg: signs in as the service identity and reads the code off the 302. */
async function authorizationCode(
  fetch: FetchLike,
  issuer: string,
  authorizationUrl: string,
  password: string,
  state: string,
): Promise<string> {
  const base = issuer.replace(/\/$/, '');
  const first = await fetch(`${base}/api/firstfactor`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username: TEST_IDENTITY, password, keepMeLoggedIn: false }),
  });
  if (!first.ok) throw new Error(`the first factor answered ${first.status}`);
  const cookie = cookieFrom(first);
  const authorize = await fetch(authorizationUrl, {
    headers: { cookie },
    redirect: 'manual',
  });
  const location = authorize.headers.get('location');
  if (authorize.status !== 302 || location === null) {
    throw new Error(`the authorization request answered ${authorize.status}, not a redirect`);
  }
  const back = new URL(location, base);
  if (`${back.origin}${back.pathname}` !== RECORD_REDIRECT_URI) {
    throw new Error('the authorization request redirected somewhere else');
  }
  if (back.searchParams.get('state') !== state) throw new Error('the state came back changed');
  const code = back.searchParams.get('code');
  if (code === null) throw new Error(`the sign-on refused: ${back.searchParams.get('error')}`);
  return code;
}

export async function recordOidc(
  input: OidcRecordInput,
): Promise<{ written: string[]; names: string[] }> {
  const random = input.random ?? randomBytes;
  const now = (input.now ?? Date.now)();
  const { keys } = input;
  const fixture: SignInFixture = {
    state: random(32).toString('base64url'),
    nonce: random(32).toString('base64url'),
    verifier: random(32).toString('base64url'),
    now,
    clientId: 'auralis',
    redirectUri: RECORD_REDIRECT_URI,
  };
  const secrets = [keys.clientSecret, keys.password, keys.absProvisionKey, keys.jellyfinApiKey];
  const written: string[] = [];
  const names: string[] = [];

  // The sign-on.
  const oidcDir = join(input.root, 'oidc', 'recordings');
  const oidcRec = createRecorder({
    fetch: input.fetch,
    dir: oidcDir,
    upstream: 'authelia',
    upstreamVersion: input.oidcVersion,
    secrets,
    baseUrl: input.issuer,
    prepare: (raw) => resignExchange(raw, input.issuer, [TEST_IDENTITY]),
  });
  const client = new OidcClient({
    issuer: input.issuer,
    clientId: fixture.clientId,
    clientSecret: keys.clientSecret,
    redirectUri: fixture.redirectUri,
    fetch: oidcRec.fetch,
    now: () => now,
  });
  const discovery = await oidcRec.capture('discovery', () => client.discover());
  const code = await authorizationCode(
    input.fetch,
    input.issuer,
    await client.authorizationUrl(fixture),
    keys.password,
    fixture.state,
  );
  // One-time and spent, but still never written.
  secrets.push(code, fixture.verifier);
  const tokens = await oidcRec.capture('token', () =>
    client.exchange(code, fixture.verifier, discovery),
  );
  await oidcRec.capture('jwks', () =>
    client.verifyIdToken(tokens.id_token, fixture.nonce, discovery),
  );
  await oidcRec.capture('userinfo', () => client.userinfo(tokens.access_token, discovery));
  await mkdir(oidcDir, { recursive: true });
  const fixtureFile = join(oidcDir, 'sign-in.json');
  await writeFile(fixtureFile, `${JSON.stringify(fixture, null, 2)}\n`);
  written.push(
    ...['discovery', 'token', 'jwks', 'userinfo'].map((c) => join(oidcDir, `${c}.json`)),
  );

  const anonymize = (raw: RawExchange) => {
    const result = anonymizeAccounts(raw, [TEST_IDENTITY]);
    names.push(...result.names);
    return result.raw;
  };

  // Audiobookshelf: the provisioning key mints the service identity's own key.
  const absDir = join(input.root, 'audiobookshelf', 'recordings');
  const absVersion = await new AbsClient({
    baseUrl: input.absUrl,
    token: keys.absProvisionKey,
    fetch: input.fetch,
  }).getServerVersion();
  const absRec = createRecorder({
    fetch: input.fetch,
    dir: absDir,
    upstream: 'audiobookshelf',
    upstreamVersion: absVersion,
    secrets,
    baseUrl: input.absUrl,
    prepare: anonymize,
  });
  const abs = new AbsProvisioner({
    baseUrl: input.absUrl,
    provisionKey: keys.absProvisionKey,
    fetch: absRec.fetch,
  });
  const absAccounts = await absRec.capture('users-list', () => abs.accounts());
  const absUser = absAccounts.find((a) => a.username === TEST_IDENTITY);
  if (!absUser) throw new Error(`Audiobookshelf has no active user ${TEST_IDENTITY}`);
  let absKeyId: string | undefined;
  try {
    const minted = await absRec.capture('api-key-create', () => abs.mint(absUser.id));
    absKeyId = minted.keyId;
  } finally {
    if (absKeyId !== undefined) {
      const res = await input.fetch(
        new URL(`api/api-keys/${encodeURIComponent(absKeyId)}`, `${input.absUrl}/`).toString(),
        { method: 'DELETE', headers: { authorization: `Bearer ${keys.absProvisionKey}` } },
      );
      input.out(`deleted the minted Audiobookshelf key: ${res.status}`);
    }
  }
  written.push(join(absDir, 'users-list.json'), join(absDir, 'api-key-create.json'));

  // Jellyfin: the API key approves a Quick Connect request for the service identity.
  const jfDir = join(input.root, 'jellyfin', 'recordings');
  const jfVersion = await new JellyfinClient({
    baseUrl: input.jellyfinUrl,
    token: keys.jellyfinApiKey,
    fetch: input.fetch,
  }).getServerVersion();
  const jfRec = createRecorder({
    fetch: input.fetch,
    dir: jfDir,
    upstream: 'jellyfin',
    upstreamVersion: jfVersion,
    secrets,
    baseUrl: input.jellyfinUrl,
    prepare: anonymize,
  });
  const jf = new JellyfinProvisioner({
    baseUrl: input.jellyfinUrl,
    apiKey: keys.jellyfinApiKey,
    fetch: jfRec.fetch,
  });
  const jfAccounts = await jfRec.capture('users-list', () => jf.accounts());
  const jfUser = jfAccounts.find((a) => a.username === TEST_IDENTITY);
  if (!jfUser) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  let jfToken: string | undefined;
  try {
    const request = await jfRec.capture('quick-connect-initiate', () =>
      jf.initiate(RECORD_USER_ID),
    );
    secrets.push(request.Secret);
    await jfRec.capture('quick-connect-authorize', () => jf.authorize(request.Code, jfUser.id));
    const session = await jfRec.capture('quick-connect-authenticate', () =>
      jf.authenticate(request.Secret, RECORD_USER_ID, jfUser.id),
    );
    jfToken = session.token;
  } finally {
    if (jfToken !== undefined) {
      const res = await input.fetch(
        new URL('Sessions/Logout', `${input.jellyfinUrl}/`).toString(),
        {
          method: 'POST',
          headers: {
            authorization: buildAuthorizationHeader(personDevice(RECORD_USER_ID), jfToken),
          },
        },
      );
      input.out(`logged out the minted Jellyfin token: ${res.status}`);
    }
  }
  written.push(
    ...[
      'users-list',
      'quick-connect-initiate',
      'quick-connect-authorize',
      'quick-connect-authenticate',
    ].map((c) => join(jfDir, `${c}.json`)),
  );
  input.out(`wrote ${fixtureFile}`);
  return { written, names };
}
