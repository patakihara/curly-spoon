/**
 * Every error the API client raises is an `ApiError` — callers branch on `.code`,
 * never on message text (except `describeSetupError`, which deliberately does
 * read text, see below). Two origins are distinguished by `status`:
 *
 * - `status === 0` — the browser's `fetch` itself failed: the Auralis server (the
 *   BFF) is unreachable. This is a different failure than anything the BFF itself
 *   reports, and is surfaced distinctly so a user isn't told "check your
 *   Audiobookshelf URL" when the actual problem is that our own server is down.
 * - `status > 0` — the BFF answered, with its `{ error: { code, message } }` shape
 *   (see apps/server/src/httpErrors.ts). `code` is one of that file's API codes,
 *   e.g. `upstream_unreachable`, `unauthenticated`, `invalid_credentials`.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** True for the "couldn't even reach the Auralis server" case. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Shape the BFF always uses for error bodies — see apps/server/src/httpErrors.ts. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const err = (value as { error: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code: unknown }).code === 'string' &&
    typeof (err as { message: unknown }).message === 'string'
  );
}

/**
 * Turns a non-2xx `Response` body into an `ApiError`, without assuming the body is
 * well-formed JSON (a proxy or reverse-proxy error page in front of the BFF would
 * not be) — a total function that always resolves to *something* describable, per
 * the house style of degrading rather than throwing an unhandled shape downstream.
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const text = await response.text().catch(() => '');
  if (text.length > 0) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (isApiErrorBody(parsed)) {
        return new ApiError(parsed.error.code, parsed.error.message, response.status);
      }
    } catch {
      // fall through to the generic case below
    }
  }
  return new ApiError(
    'unexpected_response',
    `Unexpected response from the server (HTTP ${response.status})`,
    response.status,
  );
}

/** Wraps whatever `fetch` itself threw (DNS/TCP/TLS/abort) as a network-origin `ApiError`. */
export function apiErrorFromNetworkFailure(cause: unknown): ApiError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return new ApiError('network_error', `Could not reach the Auralis server: ${detail}`, 0);
}
