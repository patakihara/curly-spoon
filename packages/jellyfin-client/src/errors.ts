/**
 * Errors the client can raise, distinguished by machine-checkable `code` rather
 * than message text, so callers (the BFF routes, in particular) can branch on
 * failure kind without string matching. Mirrors `@auralis/abs-client`'s
 * `AbsError` so both media clients present the same failure shape upstream.
 */

export type JellyfinErrorCode =
  /** `fetch` itself rejected: DNS, TCP, TLS, connection refused, etc. */
  | 'network'
  /** The request did not complete inside the configured timeout. */
  | 'timeout'
  /** Upstream responded 401: the token is missing, wrong or expired. */
  | 'auth'
  /** Upstream responded 403: the token is valid but the account lacks permission for
   * this action. Kept distinct from `auth` so callers don't treat "you're not allowed
   * to do that" as "your session expired" and log the user out. */
  | 'forbidden'
  /** Upstream responded 404. */
  | 'not_found'
  /** Upstream responded 5xx: it is up but failing. */
  | 'upstream_error'
  /** Upstream responded with a 4xx we don't have a specific case for. */
  | 'bad_request'
  /** The response body did not match the zod schema we parse it with. */
  | 'schema_mismatch';

export interface JellyfinErrorOptions {
  status?: number;
  cause?: unknown;
}

/** Raised for every failure the client produces. Never throws anything else. */
export class JellyfinError extends Error {
  readonly code: JellyfinErrorCode;
  readonly status: number | undefined;
  override readonly cause: unknown;

  constructor(code: JellyfinErrorCode, message: string, options: JellyfinErrorOptions = {}) {
    super(message);
    this.name = 'JellyfinError';
    this.code = code;
    this.status = options.status;
    this.cause = options.cause;
  }

  static network(cause: unknown): JellyfinError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new JellyfinError('network', `Could not reach Jellyfin: ${detail}`, { cause });
  }

  static timeout(timeoutMs: number): JellyfinError {
    return new JellyfinError('timeout', `Jellyfin did not respond within ${timeoutMs}ms`);
  }

  static auth(status: number): JellyfinError {
    return new JellyfinError('auth', 'Jellyfin rejected the credentials or access token', {
      status,
    });
  }

  static forbidden(status: number): JellyfinError {
    return new JellyfinError(
      'forbidden',
      'Jellyfin rejected the request: this account does not have permission',
      { status },
    );
  }

  static notFound(path: string): JellyfinError {
    return new JellyfinError('not_found', `Not found upstream: ${path}`, { status: 404 });
  }

  static upstream(status: number, body?: string): JellyfinError {
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    return new JellyfinError('upstream_error', `Jellyfin returned ${status}${detail}`, {
      status,
    });
  }

  static badRequest(status: number, body?: string): JellyfinError {
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    return new JellyfinError('bad_request', `Jellyfin rejected the request (${status})${detail}`, {
      status,
    });
  }

  static schemaMismatch(context: string, cause: unknown): JellyfinError {
    return new JellyfinError(
      'schema_mismatch',
      `Jellyfin response for ${context} did not match the expected shape`,
      { cause },
    );
  }
}

/** True for any error this package raises, as a type-narrowing guard. */
export function isJellyfinError(value: unknown): value is JellyfinError {
  return value instanceof JellyfinError;
}
