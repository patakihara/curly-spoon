/**
 * Signing in through the household sign-on. `/auth/login` starts it, `/auth/callback` finishes it
 * for the browser (a session cookie) or for the Android app (a one-time code for
 * `auralis://auth/callback`, swapped at `/auth/token` for a bearer token). All three are public
 * and rate-limited per client address.
 */

import { appToken, DEVICE_COOKIE, login, loginCallback, Username } from '@auralis/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { setDeviceCookie, setSessionCookie } from '../auth/cookie.js';
import { type SignOn, SignOnError } from '../auth/oidc.js';
import { RateLimiter } from '../auth/rateLimit.js';
import type { CookieSecure } from '../config.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { reuseOrCreateDevice } from '../store/devices.js';
import { BEARER_TTL_MS, createSession } from '../store/sessions.js';
import { issueAppCode, type Random, startLogin, takeAppCode, takeLogin } from '../store/signIn.js';
import { signInUser, UsernameTaken } from '../store/users.js';
import type { Linker } from '../upstream/links.js';

/** Who may sign in at all: household members, and the recording service account. */
export const MEMBER_GROUPS = ['household', 'auralis_service'] as const;
/** Directory admins are Auralis admins. */
export const ADMIN_GROUP = 'lldap_admin';
export const APP_REDIRECT = 'auralis://auth/callback';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 20;

export interface SignOnRoutesOptions {
  db: Db;
  cookieSecure: CookieSecure;
  /** `null` when the sign-on is not configured: the routes answer 404 `sign_on_off`. */
  signOn: SignOn | null;
  linker: Linker | null;
  random: Random;
  now: () => number;
}

/** Only a path on this site: never another origin, a scheme, or a protocol-relative URL. */
function sameSitePath(value: string | undefined): string {
  if (value === undefined || !value.startsWith('/') || /^\/[/\\]/.test(value)) return '/';
  return value;
}

export function signOnRoutes(app: FastifyInstance, options: SignOnRoutesOptions): void {
  const { db, cookieSecure, signOn, linker, random, now } = options;
  const limiter = new RateLimiter({ windowMs: RATE_WINDOW_MS, max: RATE_MAX });

  function limit(request: FastifyRequest, reply: FastifyReply) {
    const at = now();
    limiter.sweep(at);
    const result = limiter.consume(request.ip, at);
    if (!result.allowed) {
      reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      throw new Refusal(429, 'too_many_attempts');
    }
  }

  function configured(): SignOn {
    if (signOn === null) throw new Refusal(404, 'sign_on_off');
    return signOn;
  }

  serve(app, login, async (request, reply, _body, { query }) => {
    limit(request, reply);
    const provider = configured();
    if (query.client === 'android' && query.code_challenge === undefined) {
      throw new Refusal(400, 'code_challenge_required');
    }
    const started = startLogin(
      db,
      {
        client: query.client,
        returnTo: query.client === 'web' ? sameSitePath(query.return_to) : '/',
        appChallenge: query.client === 'android' ? (query.code_challenge ?? null) : null,
        deviceId: query.client === 'android' ? (query.device_id ?? null) : null,
      },
      random,
      now(),
    );
    return { location: await provider.authorizationUrl(started) };
  });

  serve(app, loginCallback, async (request, reply, _body, { query }) => {
    limit(request, reply);
    const provider = configured();
    if (query.state === undefined) throw new Refusal(400, 'bad_state');
    const started = takeLogin(db, query.state, now());
    if (started === null) throw new Refusal(400, 'bad_state');
    if (query.error !== undefined || query.code === undefined) {
      throw new Refusal(400, 'sign_on_refused');
    }

    let identity;
    try {
      identity = await provider.complete(query.code, started);
    } catch (error) {
      if (error instanceof SignOnError && error.kind === 'bad_token') {
        throw new Refusal(400, 'bad_token');
      }
      throw new Refusal(502, 'sign_on_unavailable');
    }
    if (!MEMBER_GROUPS.some((g) => identity.groups.includes(g))) {
      throw new Refusal(403, 'not_household');
    }
    const username = Username.safeParse(identity.username);
    if (!username.success) throw new Refusal(403, 'bad_username');

    let user;
    try {
      user = signInUser(
        db,
        {
          issuer: identity.issuer,
          sub: identity.sub,
          username: username.data,
          directoryAdmin: identity.groups.includes(ADMIN_GROUP),
        },
        now(),
      );
    } catch (error) {
      if (error instanceof UsernameTaken) throw new Refusal(403, 'username_taken');
      throw error;
    }
    await linker?.linkAll(user);

    if (started.client === 'android') {
      const device = reuseOrCreateDevice(
        db,
        { userId: user.id, kind: 'android', id: started.deviceId ?? undefined },
        now(),
      );
      const code = issueAppCode(
        db,
        { userId: user.id, deviceId: device.id, appChallenge: started.appChallenge ?? '' },
        random,
        now(),
      );
      return { location: `${APP_REDIRECT}?code=${encodeURIComponent(code)}` };
    }

    const device = reuseOrCreateDevice(
      db,
      { userId: user.id, kind: 'web', id: request.cookies[DEVICE_COOKIE] },
      now(),
    );
    const session = createSession(db, { userId: user.id, deviceId: device.id, now: now() });
    setDeviceCookie(request, reply, cookieSecure, device.id);
    setSessionCookie(request, reply, cookieSecure, session.token, session.expiresAt);
    return { location: started.returnTo };
  });

  serve(app, appToken, (request, reply, body) => {
    limit(request, reply);
    configured();
    const signedIn = takeAppCode(db, body.code, body.codeVerifier, now());
    if (signedIn === null) throw new Refusal(400, 'bad_code');
    const session = createSession(db, {
      ...signedIn,
      kind: 'bearer',
      ttlMs: BEARER_TTL_MS,
      now: now(),
    });
    return { token: session.token, deviceId: signedIn.deviceId, expiresAt: session.expiresAt };
  });
}
