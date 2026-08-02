/** The one httpOnly cookie the BFF issues: an opaque pointer to a row in `sessions`. */

export const SESSION_COOKIE_NAME = 'auralis_session';

export interface CookieOptions {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge?: number;
}

/**
 * `sameSite: 'lax'` is the CSRF-safe default: it's sent on top-level navigation
 * (so a normal reload keeps you signed in) but withheld on cross-site subrequests
 * (so a third-party page can't ride the cookie to call our mutating routes).
 * `secure` should be true whenever the app is served over HTTPS — callers pass
 * `config.nodeEnv === 'production'` for that; it's kept togglable for local HTTP dev.
 */
export function sessionCookieOptions(secure: boolean, maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    ...(maxAgeMs !== undefined ? { maxAge: Math.floor(maxAgeMs / 1000) } : {}),
  };
}
