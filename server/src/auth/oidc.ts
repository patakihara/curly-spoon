/**
 * The household sign-on, as an OpenID Connect relying party: authorization code with PKCE S256,
 * a confidential client (`client_secret_basic`), and an RS256 ID token checked with `jose` for
 * issuer, audience, authorized party, times and nonce. Userinfo's subject must be the ID
 * token's. Every answer is parsed with zod; the network and the clock are injected.
 */

import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AdapterError, type FetchLike, requestJson } from '../adapters/http/fetch.js';
import { s256 } from '../store/signIn.js';

export const SCOPES = 'openid profile email groups';

/** Who the sign-on says signed in. */
export interface Identity {
  issuer: string;
  sub: string;
  /** `preferred_username`: the directory login id. */
  username: string;
  groups: string[];
}

/** What the sign-in routes need from a sign-on. */
export interface SignOn {
  authorizationUrl(request: { state: string; nonce: string; verifier: string }): Promise<string>;
  complete(code: string, request: { verifier: string; nonce: string }): Promise<Identity>;
}

/** `bad_token`: the answer was refused. `unavailable`: the sign-on could not be reached. */
export class SignOnError extends Error {
  override readonly name = 'SignOnError';
  constructor(
    readonly kind: 'bad_token' | 'unavailable',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const discoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
});
export type Discovery = z.infer<typeof discoverySchema>;

export const jwksSchema = z.object({ keys: z.array(z.record(z.unknown())).min(1) });

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().min(1),
  token_type: z.string().regex(/^bearer$/i),
});

export const userinfoSchema = z.object({
  sub: z.string().min(1),
  preferred_username: z.string().min(1).optional(),
  groups: z.array(z.string()).optional(),
});

const idTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  nonce: z.string(),
  azp: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]),
  preferred_username: z.string().min(1).optional(),
  groups: z.array(z.string()).optional(),
});

export interface OidcOptions {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch: FetchLike;
  now: () => number;
}

/** RFC 6749 section 2.3.1: each part form-encoded before the Basic pair is made. */
function basicAuth(id: string, secret: string): string {
  const enc = (s: string) => encodeURIComponent(s).replace(/%20/g, '+');
  return `Basic ${Buffer.from(`${enc(id)}:${enc(secret)}`).toString('base64')}`;
}

async function upstream<T>(what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    if (cause instanceof SignOnError) throw cause;
    const refused =
      cause instanceof AdapterError &&
      (cause.kind === 'parse' || (cause.status !== undefined && cause.status < 500));
    if (refused) throw new SignOnError('bad_token', `${what} was refused`, { cause });
    throw new SignOnError('unavailable', `${what} failed`, { cause });
  }
}

export class OidcClient implements SignOn {
  private discovery: Promise<Discovery> | undefined;

  constructor(private readonly opts: OidcOptions) {}

  /** Read once per process; a failed read is retried on the next sign-in. */
  discover(): Promise<Discovery> {
    this.discovery ??= upstream('discovery', async () => {
      const url = `${this.opts.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const doc = await requestJson(this.opts.fetch, url, {}, discoverySchema);
      if (doc.issuer !== this.opts.issuer) {
        throw new SignOnError('bad_token', 'discovery names another issuer');
      }
      return doc;
    }).catch((error: unknown) => {
      this.discovery = undefined;
      throw error;
    });
    return this.discovery;
  }

  async authorizationUrl(request: {
    state: string;
    nonce: string;
    verifier: string;
  }): Promise<string> {
    const { authorization_endpoint } = await this.discover();
    const url = new URL(authorization_endpoint);
    const params = {
      response_type: 'code',
      client_id: this.opts.clientId,
      redirect_uri: this.opts.redirectUri,
      scope: SCOPES,
      state: request.state,
      nonce: request.nonce,
      code_challenge: s256(request.verifier),
      code_challenge_method: 'S256',
    };
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  }

  async complete(code: string, request: { verifier: string; nonce: string }): Promise<Identity> {
    const discovery = await this.discover();
    const tokens = await upstream('the token exchange', () =>
      requestJson(
        this.opts.fetch,
        discovery.token_endpoint,
        {
          method: 'POST',
          headers: { authorization: basicAuth(this.opts.clientId, this.opts.clientSecret) },
          form: {
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.opts.redirectUri,
            code_verifier: request.verifier,
          },
        },
        tokenResponseSchema,
      ),
    );
    const claims = await this.verifyIdToken(tokens.id_token, request.nonce, discovery);
    const info = await upstream('userinfo', () =>
      requestJson(
        this.opts.fetch,
        discovery.userinfo_endpoint,
        { headers: { authorization: `Bearer ${tokens.access_token}` } },
        userinfoSchema,
      ),
    );
    if (info.sub !== claims.sub)
      throw new SignOnError('bad_token', 'userinfo names another subject');
    const username = info.preferred_username ?? claims.preferred_username;
    if (username === undefined) throw new SignOnError('bad_token', 'no preferred_username');
    return {
      issuer: this.opts.issuer,
      sub: claims.sub,
      username,
      groups: [...new Set([...(claims.groups ?? []), ...(info.groups ?? [])])],
    };
  }

  /** RS256 only, against the sign-on's published keys, at the injected time. */
  async verifyIdToken(idToken: string, nonce: string, discovery?: Discovery) {
    const { jwks_uri } = discovery ?? (await this.discover());
    const jwks = await upstream('the signing keys', () =>
      requestJson(this.opts.fetch, jwks_uri, {}, jwksSchema),
    );
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(idToken, createLocalJWKSet(jwks as JSONWebKeySet), {
        algorithms: ['RS256'],
        issuer: this.opts.issuer,
        audience: this.opts.clientId,
        currentDate: new Date(this.opts.now()),
        requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
      }));
    } catch (cause) {
      throw new SignOnError('bad_token', 'the ID token does not verify', { cause });
    }
    const claims = idTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw new SignOnError('bad_token', 'the ID token claims do not parse');
    const { data } = claims;
    if (data.nonce !== nonce) throw new SignOnError('bad_token', 'the ID token nonce differs');
    const audiences = Array.isArray(data.aud) ? data.aud : [data.aud];
    if ((audiences.length > 1 || data.azp !== undefined) && data.azp !== this.opts.clientId) {
      throw new SignOnError('bad_token', 'the ID token was issued to another party');
    }
    return data;
  }
}
