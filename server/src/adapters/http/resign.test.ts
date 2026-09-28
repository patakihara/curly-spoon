/** The sign-on recording's two extra scrub steps, on synthetic exchanges. */
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { anonymizeAccounts } from './accounts.js';
import { PLACEHOLDER_ISSUER, resignExchange } from './resign.js';
import { scanRecording } from './scan.js';
import { type RawExchange, scrub } from './scrub.js';
import { isTestSignedJwt, jwtClaims, TEST_PUBLIC_JWK } from './testSigningKey.js';

const ISSUER = 'https://auth.example-household.test';
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

/** A token as a real sign-on would sign it, with a key nobody commits. */
function liveToken(claims: Record<string, unknown>) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const input = `${b64({ alg: 'RS256', kid: 'live-kid', typ: 'JWT' })}.${b64(claims)}`;
  return `${input}.${sign('sha256', Buffer.from(input), privateKey).toString('base64url')}`;
}

function exchange(path: string, json: unknown): RawExchange {
  return {
    upstream: 'oidc',
    upstreamVersion: '4.39.28',
    call: 'c',
    request: { method: 'POST', url: `${ISSUER}${path}`, headers: {}, body: null },
    response: { status: 200, headers: { 'content-type': 'application/json' }, body: { json } },
  };
}

const options = { secrets: [], baseUrl: ISSUER };

describe('re-signing the recorded ID token', () => {
  const claims = {
    iss: ISSUER,
    aud: ['auralis'],
    sub: '0f6c7a9e-0000-4000-8000-000000000000',
    nonce: 'n-1',
    email: 'someone@example-household.test',
    preferred_username: 'auralis',
    iat: 1_800_000_000,
    exp: 1_800_003_600,
  };

  it('signs it with the test key under the recorded kid, claims scrubbed, and keeps it through scrub', () => {
    const raw = exchange('/api/oidc/token', {
      access_token: 'opaque-access',
      id_token: liveToken(claims),
      token_type: 'bearer',
    });
    const recording = scrub(resignExchange(raw, ISSUER), options);
    const json = (recording.response.body as { json: Record<string, string> }).json;
    const idToken = json.id_token as string;

    expect(isTestSignedJwt(idToken)).toBe(true);
    expect(
      JSON.parse(Buffer.from(idToken.split('.')[0] as string, 'base64url').toString()),
    ).toEqual({ alg: 'RS256', kid: 'live-kid', typ: 'JWT' });
    expect(jwtClaims(idToken)).toEqual({
      ...claims,
      iss: PLACEHOLDER_ISSUER,
      email: 'user@upstream.invalid',
    });
    expect(json.access_token).toBe('<token>');
    expect(scanRecording(recording)).toEqual([]);
  });

  it('still flags a JWT that the test key did not sign', () => {
    const raw = exchange('/api/oidc/token', { id_token: liveToken(claims) });
    const findings = scanRecording(scrub(raw, options)).map((f) => f.kind);
    expect(findings).not.toContain('jwt');
    const leaked = scrub(exchange('/x', { note: liveToken(claims) }), options);
    expect(scanRecording(leaked).map((f) => f.kind)).toContain('jwt');
  });

  it("gives the recorded signing keys the test key's modulus and exponent, keeping their kid", () => {
    const raw = exchange('/jwks.json', {
      keys: [{ kty: 'RSA', kid: 'live-kid', use: 'sig', alg: 'RS256', n: 'live-n', e: 'AQAB' }],
    });
    const json = (resignExchange(raw, ISSUER).response.body as { json: { keys: unknown[] } }).json;
    expect(json.keys).toEqual([
      { kty: 'RSA', kid: 'live-kid', use: 'sig', alg: 'RS256', n: TEST_PUBLIC_JWK.n, e: 'AQAB' },
    ]);
  });
});

describe('keeping other people out of a recorded user list', () => {
  it('replaces every Audiobookshelf account but the test identity, history and all', () => {
    const raw = exchange('/api/users', {
      users: [
        { id: 'id-a', username: 'auralis', email: null, mediaProgress: [{ id: 'p' }] },
        { id: 'id-b', username: 'Élise', email: 'e@example-household.test', mediaProgress: [{}] },
        { id: 'id-c', username: 'Kara', email: null, bookmarks: [{}] },
      ],
    });
    const { raw: out, names } = anonymizeAccounts(raw, ['auralis']);
    expect((out.response.body as { json: unknown }).json).toEqual({
      users: [
        { id: 'id-a', username: 'auralis', email: null, mediaProgress: [{ id: 'p' }] },
        { id: 'user-1', username: 'user-1', email: 'user@upstream.invalid', mediaProgress: [] },
        { id: 'user-2', username: 'user-2', email: null, bookmarks: [] },
      ],
    });
    expect(names).toEqual(['e@example-household.test', 'Élise', 'Kara']);
  });

  it("replaces every Jellyfin account but the test identity's", () => {
    const raw = exchange('/Users', [
      { Id: 'aa', Name: 'auralis' },
      { Id: 'bb', Name: 'Kara' },
    ]);
    const { raw: out } = anonymizeAccounts(raw, ['auralis']);
    expect((out.response.body as { json: unknown }).json).toEqual([
      { Id: 'aa', Name: 'auralis' },
      { Id: 'user-1', Name: 'user-1' },
    ]);
  });

  it('flags any name seen while recording that is left anywhere in a recording', () => {
    const recording = scrub(exchange('/x', { note: 'played by kara yesterday' }), options);
    expect(scanRecording(recording, { names: ['Kara'] }).map((f) => f.kind)).toEqual(['name']);
    expect(scanRecording(recording, { names: ['Otto'] })).toEqual([]);
  });
});
