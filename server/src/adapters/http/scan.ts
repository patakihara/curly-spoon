/**
 * The last check before a recording is committed: finds anything that looks like a token, key,
 * cookie, password, private address, real host or email. Generic by design: the repo is public,
 * so no real hostname is written here to look for.
 */
import { type Recording } from './recording.js';
import {
  EMAIL,
  IPV4,
  isAllowedIp,
  PLACEHOLDER,
  PLACEHOLDER_EMAIL,
  PLACEHOLDER_HOST,
  SECRET_BODY_KEY,
  SECRET_QUERY_KEY,
  VERSION_KEY,
} from './scrub.js';

export type FindingKind =
  'jwt' | 'secret-field' | 'query-secret' | 'cookie' | 'ip' | 'host' | 'email';

export interface Finding {
  kind: FindingKind;
  /** A JSON path into the recording, such as `$.response.body.json.user.token`. */
  path: string;
}

/** Public hosts that published book or album metadata may carry. Empty until one turns up. */
export const PUBLIC_HOSTS: readonly string[] = [];
const ALLOWED_HOSTS = new Set([PLACEHOLDER_HOST, 'localhost', '127.0.0.1', ...PUBLIC_HOSTS]);

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;
const URL_HOST = /https?:\/\/([^/\s:"'?#]+)/gi;
const BARE_HOST =
  /(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:net|com|org|io|dev|app|lan|local|home|arpa)(?![\w-])/gi;

function hosts(value: string): string[] {
  const found = [...value.matchAll(URL_HOST)].map((m) => m[1] ?? '');
  const withoutUrls = value.replace(URL_HOST, ' ');
  found.push(...[...withoutUrls.matchAll(BARE_HOST)].map((m) => m[0]));
  return found.map((h) => h.toLowerCase());
}

function authorizationIsClean(value: string): boolean {
  if (value === `Bearer ${PLACEHOLDER}`) return true;
  if (!/^MediaBrowser\s/.test(value)) return false;
  return [...value.matchAll(/Token="([^"]*)"/g)].every((m) => m[1] === PLACEHOLDER);
}

function scanString(value: string, key: string | undefined, add: (k: FindingKind) => void) {
  if (JWT.test(value)) add('jwt');
  if (key === undefined || !VERSION_KEY.test(key)) {
    if ([...value.matchAll(IPV4)].some((m) => !isAllowedIp(m[0]))) add('ip');
  }
  if (hosts(value).some((h) => !ALLOWED_HOSTS.has(h))) add('host');
  if ([...value.matchAll(EMAIL)].some((m) => m[0] !== PLACEHOLDER_EMAIL)) add('email');
}

export function scanRecording(recording: Recording): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (kind: FindingKind, path: string) => {
    if (seen.has(`${kind} ${path}`)) return;
    seen.add(`${kind} ${path}`);
    findings.push({ kind, path });
  };

  /** Walks any JSON value; `fields` checks token-like keys (bodies and the top level). */
  const walk = (value: unknown, key: string | undefined, path: string, fields: boolean) => {
    if (typeof value === 'string') {
      if (
        fields &&
        key !== undefined &&
        SECRET_BODY_KEY.test(key) &&
        value.length > 0 &&
        value !== PLACEHOLDER
      ) {
        add('secret-field', path);
      }
      scanString(value, key, (k) => add(k, path));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, key, `${path}[${i}]`, fields));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k, `${path}.${k}`, fields);
    }
  };

  const { request, response } = recording;
  for (const [name, value] of [
    ['upstream', recording.upstream],
    ['upstreamVersion', recording.upstreamVersion],
    ['call', recording.call],
  ] as const) {
    walk(value, name, `$.${name}`, true);
  }
  walk(request.path, undefined, '$.request.path', false);

  for (const [k, v] of Object.entries(request.query)) {
    const path = `$.request.query.${k}`;
    if (SECRET_QUERY_KEY.test(k) && v !== PLACEHOLDER) add('query-secret', path);
    walk(v, k, path, false);
  }

  for (const [side, headers] of [
    ['request', request.headers],
    ['response', response.headers],
  ] as const) {
    for (const [name, value] of Object.entries(headers)) {
      const path = `$.${side}.headers.${name}`;
      const lower = name.toLowerCase();
      if (lower === 'cookie' || lower === 'set-cookie') add('cookie', path);
      if (lower === 'authorization' && !authorizationIsClean(value)) add('secret-field', path);
      walk(value, name, path, false);
    }
  }

  for (const [side, body] of [
    ['request', request.body],
    ['response', response.body],
  ] as const) {
    if (body === null) continue;
    if ('text' in body) walk(body.text, undefined, `$.${side}.body.text`, false);
    else walk(body.json, undefined, `$.${side}.body.json`, true);
  }
  return findings;
}
