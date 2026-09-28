import { importJWK, type JWK, SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import testKey from '../adapters/http/test-signing-key.json' with { type: 'json' };
import { type FetchLike } from '../adapters/http/fetch.js';
import { type Discovery, OidcClient, SignOnError } from './oidc.js';

const ISSUER = 'https://upstream.invalid';
const NOW = 1_800_000_000_000;
const KID = 'test-kid';
const { label: _label, ...privateJwk } = testKey;
const publicJwk = { kty: testKey.kty, n: testKey.n, e: testKey.e, kid: KID, alg: 'RS256' };

const discovery: Discovery = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/api/oidc/authorization`,
  token_endpoint: `${ISSUER}/api/oidc/token`,
  userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
  jwks_uri: `${ISSUER}/jwks.json`,
};

/** Serves only the test key's public half: the one thing these tests fetch. */
const jwksFetch: FetchLike = async (url) => {
  if (url !== discovery.jwks_uri) throw new Error(`unexpected ${url}`);
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: { 'content-type': 'application/json' },
  });
};

const client = new OidcClient({
  issuer: ISSUER,
  clientId: 'auralis',
  clientSecret: 'unused',
  redirectUri: 'http://127.0.0.1:8787/auth/callback',
  fetch: jwksFetch,
  now: () => NOW,
});

async function idToken(
  claims: Record<string, unknown>,
  {
    iss = ISSUER,
    aud = 'auralis',
    iat = Math.floor(NOW / 1000) - 10,
  }: { iss?: string; aud?: string; iat?: number } = {},
) {
  const key = await importJWK(privateJwk as JWK, 'RS256');
  return new SignJWT({ nonce: 'n-1', azp: 'auralis', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(iss)
    .setAudience(aud)
    .setSubject('sub-kara')
    .setIssuedAt(iat)
    .setExpirationTime(iat + 3600)
    .sign(key);
}

const refused = (promise: Promise<unknown>) =>
  expect(promise).rejects.toSatisfy((e) => e instanceof SignOnError && e.kind === 'bad_token');

describe('[M0.sso/b] the ID token check', () => {
  it('accepts a token signed by the published key, for this client, with this nonce', async () => {
    const claims = await client.verifyIdToken(await idToken({}), 'n-1', discovery);
    expect(claims.sub).toBe('sub-kara');
  });

  it('refuses another nonce, audience, issuer or authorized party', async () => {
    await refused(client.verifyIdToken(await idToken({}), 'n-2', discovery));
    await refused(client.verifyIdToken(await idToken({}, { aud: 'shelfarr' }), 'n-1', discovery));
    await refused(
      client.verifyIdToken(await idToken({}, { iss: 'https://x.invalid' }), 'n-1', discovery),
    );
    await refused(client.verifyIdToken(await idToken({ azp: 'shelfarr' }), 'n-1', discovery));
  });

  it('refuses an expired token, at the injected time', async () => {
    const late = new OidcClient({
      issuer: ISSUER,
      clientId: 'auralis',
      clientSecret: 'unused',
      redirectUri: 'http://127.0.0.1:8787/auth/callback',
      fetch: jwksFetch,
      now: () => NOW + 2 * 3600 * 1000,
    });
    await refused(late.verifyIdToken(await idToken({}), 'n-1', discovery));
  });

  it('refuses a token with no signature', async () => {
    const [header, payload] = (await idToken({})).split('.');
    const none = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url');
    await refused(client.verifyIdToken(`${none}.${payload}.`, 'n-1', discovery));
    expect(header).toBeDefined();
  });

  it('refuses a token issued more than a minute in the future, and allows a little clock skew', async () => {
    const at = Math.floor(NOW / 1000);
    await refused(client.verifyIdToken(await idToken({}, { iat: at + 120 }), 'n-1', discovery));
    const skewed = await client.verifyIdToken(
      await idToken({}, { iat: at + 30 }),
      'n-1',
      discovery,
    );
    expect(skewed.sub).toBe('sub-kara');
  });

  it('refuses a token issued long before this sign-in, even if it has not expired', async () => {
    const old = Math.floor(NOW / 1000) - 30 * 60;
    await refused(client.verifyIdToken(await idToken({}, { iat: old }), 'n-1', discovery));
  });
});
