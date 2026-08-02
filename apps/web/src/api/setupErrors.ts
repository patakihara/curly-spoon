/**
 * Turns the setup probe's `ApiError` into a *specific* on-screen message —
 * "unreachable host", "TLS failure", "wrong path" and "reachable but not
 * Audiobookshelf" are meaningfully different problems for a user pointing the app
 * at their server for the first time, and a generic "failed to connect" leaves
 * them guessing which one they hit.
 *
 * The BFF's `code` (apps/server/src/httpErrors.ts) narrows most of this; within
 * `upstream_unreachable` (every transport failure collapses to one `AbsError`
 * code — see packages/abs-client/src/errors.ts) we additionally read the cause
 * text Node's `fetch` produces, which is the only place DNS/TLS/refused-connection
 * are distinguishable from each other.
 */
import { type ApiError } from './errors.js';

export interface SetupDiagnosis {
  /** Short, user-facing category — shown as the error's heading. */
  heading: string;
  /** One or two sentences of specific, actionable detail. */
  detail: string;
}

function unreachableDiagnosis(message: string): SetupDiagnosis {
  const lower = message.toLowerCase();
  if (/(enotfound|getaddrinfo|no address associated|name or service not known)/.test(lower)) {
    return {
      heading: "Can't find that server",
      detail:
        "We couldn't resolve that hostname. Double-check the address for typos — including the domain and any port number.",
    };
  }
  if (/(econnrefused|connection refused)/.test(lower)) {
    return {
      heading: 'Connection refused',
      detail:
        'That host is reachable, but nothing is listening on the port you gave. Confirm the port and that Audiobookshelf is running.',
    };
  }
  if (/(cert|tls|ssl|self.signed|unable to verify)/.test(lower)) {
    return {
      heading: 'TLS/certificate problem',
      detail:
        "The server's TLS certificate couldn't be verified. If it's self-signed, use an http:// address or fix the certificate before continuing.",
    };
  }
  if (/(etimedout|econnreset|network is unreachable)/.test(lower)) {
    return {
      heading: "Can't reach that address",
      detail:
        'The connection dropped before completing. Check the address, and that nothing between here and the server (a firewall, a VPN) is blocking it.',
    };
  }
  return {
    heading: "Can't reach that address",
    detail: `We couldn't connect to that server: ${message}`,
  };
}

/** Maps a setup-probe `ApiError` to a specific heading + detail. Never returns a generic "failed". */
export function describeSetupError(err: ApiError): SetupDiagnosis {
  if (err.isNetworkError) {
    return {
      heading: "Can't reach Auralis",
      detail:
        'The Auralis server itself did not respond. If you are running this in Docker, confirm the container is up.',
    };
  }

  switch (err.code) {
    case 'upstream_unreachable':
      return unreachableDiagnosis(err.message);
    case 'upstream_timeout':
      return {
        heading: 'Timed out',
        detail:
          'The server took too long to respond. It may be overloaded, or the address may be wrong.',
      };
    case 'not_found':
      return {
        heading: 'Wrong path',
        detail:
          "That address is reachable, but nothing answered at Audiobookshelf's expected path. If you use a reverse-proxy sub-path, include it in the URL — don't add a trailing path of your own.",
      };
    case 'upstream_schema_mismatch':
      return {
        heading: "That's not Audiobookshelf",
        detail:
          'That server responded, but not with anything that looks like Audiobookshelf. Double-check the address points at your Audiobookshelf instance, not a reverse-proxy landing page or a different app.',
      };
    case 'upstream_error':
      return {
        heading: 'Server error upstream',
        detail: `Audiobookshelf reached, but reported an error of its own: ${err.message}`,
      };
    case 'upstream_rejected':
      return {
        heading: 'Rejected by the server',
        detail: `The server reached but rejected the request: ${err.message}`,
      };
    case 'invalid_request':
      return {
        heading: 'That address is not valid',
        detail: 'Enter a full URL, including "http://" or "https://".',
      };
    default:
      return {
        heading: 'Could not connect',
        detail: err.message || 'An unexpected error occurred while contacting that server.',
      };
  }
}
