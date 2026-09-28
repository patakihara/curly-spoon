/** Record mode's sign-in part, against a fake sign-on, Audiobookshelf and Jellyfin. */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { isTestSignedJwt } from './http/testSigningKey.js';
import { type FetchLike } from './http/fetch.js';
import { runRecord } from './record-cli.js';

const ISSUER = 'https://auth.upstream.invalid';
const ABS = 'http://upstream.invalid:13378';
const JF = 'http://upstream.invalid:8096';
const NOW = 1_800_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const STDIN = [
  'OIDC_CLIENT_SECRET=client-secret-0000',
  'OIDC_TEST_PASSWORD=test-password-0000',
  'ABS_PROVISION_KEY=abs-provision-0000',
  'JELLYFIN_API_KEY=jellyfin-key-0000',
].join('\n');

function fakeWorld(options: { failAuthenticate?: boolean } = {}) {
  const asked: string[] = [];
  let nonce = '';
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const fetch: FetchLike = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? 'GET';
    asked.push(`${method} ${u.origin === ISSUER ? '' : u.port}${u.pathname}`);
    if (u.origin === ISSUER) {
      if (u.pathname === '/.well-known/openid-configuration') {
        return json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
          token_endpoint: `${ISSUER}/api/oidc/token`,
          userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
          jwks_uri: `${ISSUER}/jwks.json`,
        });
      }
      if (u.pathname === '/api/firstfactor') {
        return new Response('{"status":"OK"}', {
          headers: { 'set-cookie': 'authelia_session=sess; Path=/; HttpOnly' },
        });
      }
      if (u.pathname === '/api/oidc/authorization') {
        nonce = u.searchParams.get('nonce') ?? '';
        const back = `${u.searchParams.get('redirect_uri')}?code=the-code&state=${u.searchParams.get('state')}`;
        return new Response(null, { status: 302, headers: { location: back } });
      }
      if (u.pathname === '/api/oidc/token') {
        const idToken = await new SignJWT({ nonce, azp: 'auralis', preferred_username: 'auralis' })
          .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
          .setIssuer(ISSUER)
          .setAudience('auralis')
          .setSubject('sub-1')
          .setIssuedAt(NOW / 1000)
          .setExpirationTime(NOW / 1000 + 3600)
          .sign(privateKey);
        return json({ access_token: 'access-0000', id_token: idToken, token_type: 'bearer' });
      }
      if (u.pathname === '/jwks.json') {
        return json({
          keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }],
        });
      }
      if (u.pathname === '/api/oidc/userinfo') {
        return json({ sub: 'sub-1', preferred_username: 'auralis', groups: ['auralis_service'] });
      }
    }
    if (url.startsWith(ABS)) {
      if (u.pathname === '/status') return json({ serverVersion: '2.36.1' });
      if (u.pathname === '/api/users') {
        return json({
          users: [
            { id: 'a1', username: 'auralis', type: 'user', isActive: true },
            { id: 'a2', username: 'Kara', type: 'user', isActive: true },
          ],
        });
      }
      if (u.pathname === '/api/api-keys' && method === 'POST') {
        return json({ apiKey: { id: 'key-1', apiKey: 'minted-abs-key-0000', userId: 'a1' } });
      }
      if (u.pathname === '/api/api-keys/key-1' && method === 'DELETE') {
        return new Response('OK', { status: 200 });
      }
    }
    if (url.startsWith(JF)) {
      if (u.pathname === '/System/Info/Public') return json({ Version: '10.11.11' });
      if (u.pathname === '/Users') {
        return json([
          { Id: 'j1', Name: 'auralis' },
          { Id: 'j2', Name: 'Kara' },
        ]);
      }
      if (u.pathname === '/QuickConnect/Initiate')
        return json({ Secret: 'qc-secret-0000', Code: '123456' });
      if (u.pathname === '/QuickConnect/Authorize') return json(true);
      if (u.pathname === '/Users/AuthenticateWithQuickConnect') {
        if (options.failAuthenticate) return json({}, 500);
        return json({ AccessToken: 'minted-jf-token-0000', User: { Id: 'j1' } });
      }
      if (u.pathname === '/Sessions/Logout') return new Response(null, { status: 204 });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, asked };
}

function run(fetch: FetchLike) {
  const out: string[] = [];
  const err: string[] = [];
  let n = 0;
  const code = runRecord({
    argv: [
      '--only',
      'oidc',
      '--oidc',
      ISSUER,
      '--oidc-version',
      '4.39.28',
      '--abs',
      ABS,
      '--jellyfin',
      JF,
      '--dry-run',
    ],
    stdin: STDIN,
    fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    random: (bytes) => Buffer.alloc(bytes, ++n),
    now: () => NOW,
  });
  return { code, out, err };
}

describe('record mode for a sign-in', () => {
  it('records the sign-in and both links, saves what the test replays, and cleans up', async () => {
    const world = fakeWorld();
    const { code, out, err } = run(world.fetch);
    expect(await code).toBe(0);
    expect(err).toEqual([]);

    const written = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
    const byName = (name: string) => written.find((f) => f.endsWith(name)) as string;
    const fixture = JSON.parse(readFileSync(byName('sign-in.json'), 'utf8'));
    expect(fixture).toEqual({
      state: Buffer.alloc(32, 1).toString('base64url'),
      nonce: Buffer.alloc(32, 2).toString('base64url'),
      verifier: Buffer.alloc(32, 3).toString('base64url'),
      now: NOW,
      clientId: 'auralis',
      redirectUri: 'http://127.0.0.1:8787/auth/callback',
    });

    const token = JSON.parse(readFileSync(byName('oidc/recordings/token.json'), 'utf8'));
    expect(isTestSignedJwt(token.response.body.json.id_token)).toBe(true);
    const users = readFileSync(byName('audiobookshelf/recordings/users-list.json'), 'utf8');
    expect(users).not.toContain('Kara');
    expect(world.asked).toContain('DELETE 13378/api/api-keys/key-1');
    expect(world.asked).toContain('POST 8096/Sessions/Logout');
  });

  it('deletes the minted Audiobookshelf key even when the Jellyfin link fails', async () => {
    const world = fakeWorld({ failAuthenticate: true });
    await expect(run(world.fetch).code).rejects.toThrow(/AuthenticateWithQuickConnect/);
    expect(world.asked).toContain('DELETE 13378/api/api-keys/key-1');
    expect(world.asked).not.toContain('POST 8096/Sessions/Logout');
  });
});
