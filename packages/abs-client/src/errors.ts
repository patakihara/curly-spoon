/**
 * Errors the client can raise, distinguished by machine-checkable `code` rather
 * than message text, so callers (the BFF routes, in particular) can branch on
 * failure kind without string matching.
 */

export type AbsErrorCode =
  /** `fetch` itself rejected: DNS, TCP, TLS, connection refused, etc. */
  | 'network'
  /** The request did not complete inside the configured timeout. */
  | 'timeout'
  /** Upstream responded 401: the token is missing, wrong or expired. */
  | 'auth'
  /** Upstream responded 403: the token is valid but the account lacks permission for
   * this action (e.g. a non-admin user hitting an admin-only podcast route). Kept
   * distinct from `auth` so callers don't treat "you're not allowed to do that" as
   * "your session expired" and log the user out. */
  | 'forbidden'
  /** Upstream responded 404. */
  | 'not_found'
  /** Upstream responded 5xx: it is up but failing. */
  | 'upstream_error'
  /** Upstream responded with a 4xx we don't have a specific case for. */
  | 'bad_request'
  /** The response body did not match the zod schema we parse it with. */
  | 'schema_mismatch';

export interface AbsErrorOptions {
  status?: number;
  cause?: unknown;
}

/** Raised for every failure the client produces. Never throws anything else. */
export class AbsError extends Error {
  readonly code: AbsErrorCode;
  readonly status: number | undefined;
  override readonly cause: unknown;

  constructor(code: AbsErrorCode, message: string, options: AbsErrorOptions = {}) {
    super(message);
    this.name = 'AbsError';
    this.code = code;
    this.status = options.status;
    this.cause = options.cause;
  }

  static network(cause: unknown): AbsError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new AbsError('network', `Could not reach Audiobookshelf: ${detail}`, { cause });
  }

  static timeout(timeoutMs: number): AbsError {
    return new AbsError('timeout', `Audiobookshelf did not respond within ${timeoutMs}ms`);
  }

  static auth(status: number): AbsError {
    return new AbsError('auth', 'Audiobookshelf rejected the credentials or session token', {
      status,
    });
  }

  static forbidden(status: number): AbsError {
    return new AbsError(
      'forbidden',
      'Audiobookshelf rejected the request: this account does not have permission',
      { status },
    );
  }

  static notFound(path: string): AbsError {
    return new AbsError('not_found', `Not found upstream: ${path}`, { status: 404 });
  }

  static upstream(status: number, body?: string): AbsError {
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    return new AbsError('upstream_error', `Audiobookshelf returned ${status}${detail}`, {
      status,
    });
  }

  static badRequest(status: number, body?: string): AbsError {
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    return new AbsError('bad_request', `Audiobookshelf rejected the request (${status})${detail}`, {
      status,
    });
  }

  static schemaMismatch(context: string, cause: unknown): AbsError {
    return new AbsError(
      'schema_mismatch',
      `Audiobookshelf response for ${context} did not match the expected shape`,
      { cause },
    );
  }
}

/** True for any error this package raises, as a type-narrowing guard. */
export function isAbsError(value: unknown): value is AbsError {
  return value instanceof AbsError;
}
