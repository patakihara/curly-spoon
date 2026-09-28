/**
 * The last check before a recording is committed, and the backstop for anything the scrubber
 * missed: finds anything that looks like a token, key, cookie, password, private address, real
 * host, email or home folder. What it cannot parse, it flags. Generic by design: the repo is
 * public, so beyond the host words already named in its docs, no real hostname is written here.
 */
import { type Recording } from './recording.js';
import {
  EMAIL,
  HOME_PATH,
  HOST_FIELD,
  HOSTNAME_VALUE,
  IPV4,
  ipv6Leaks,
  isAllowedIp,
  isPlaceholderHost,
  KNOWN_HOST_WORD,
  PLACEHOLDER,
  PLACEHOLDER_EMAIL,
  PLACEHOLDER_HOME_USER,
  QUERY_PARAM,
  SECRET_BODY_KEY,
  SECRET_QUERY_KEY,
} from './scrub.js';
import { isTestSignedJwt, jwtClaims } from './testSigningKey.js';

export type FindingKind =
  | 'jwt'
  | 'secret-field'
  | 'query-secret'
  | 'cookie'
  | 'ip'
  | 'host'
  | 'email'
  | 'home-path'
  | 'name';

export interface ScanOptions {
  /** People's names seen while recording, other than the test identity's: none may remain. */
  names?: readonly string[];
}

export interface Finding {
  kind: FindingKind;
  /** A JSON path into the recording, such as `$.response.body.json.user.token`. */
  path: string;
}

/** Public hosts that published book or album metadata may carry. Empty until one turns up. */
export const PUBLIC_HOSTS: readonly string[] = [];
const ALLOWED_HOSTS = new Set(PUBLIC_HOSTS);

const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
const URL_HOST = /https?:\/\/\[?([^/\s:"'?#<>\]]+)/gi;
/** Dotted names on a well-known top-level domain, in any case. */
const LISTED_TLD_HOST =
  /(?<![@\w./-])(?:[a-z0-9-]+\.)+(?:net|com|org|io|dev|app|lan|local|home|arpa|internal)(?![\w-])/gi;
/** Any lower-case dotted name, file names aside: `files.example.fi`. */
const LOWERCASE_HOST = /(?<![@\w./-])(?:[a-z0-9-]+\.)+[a-z]{2,}(?![\w-])/g;
const FILE_EXTENSIONS = new Set(
  (
    'jpg jpeg png gif webp svg bmp mp3 m4a m4b mp4 mkv avi webm flac ogg oga opus aac wav wma ' +
    'ts json xml nfo txt epub pdf srt vtt ass lrc cue js mjs cjs css html htm db sqlite log zip ' +
    'rar gz xz tar md yml yaml ini conf cfg invalid'
  ).split(' '),
);
/** A query value that looks like an opaque credential: long, mixed case and digits, or padded. */
function isOpaque(value: string): boolean {
  if (value === PLACEHOLDER || !/^[A-Za-z0-9+/_-]{12,}={0,2}$/.test(value)) return false;
  if (/=$/.test(value)) return true;
  return value.length >= 16 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
}

function hosts(value: string): string[] {
  const found = [...value.matchAll(URL_HOST)].map((m) => m[1] ?? '');
  const rest = value.replace(URL_HOST, ' ');
  found.push(...[...rest.matchAll(LISTED_TLD_HOST)].map((m) => m[0]));
  for (const m of rest.matchAll(LOWERCASE_HOST)) {
    if (!FILE_EXTENSIONS.has(m[0].slice(m[0].lastIndexOf('.') + 1))) found.push(m[0]);
  }
  found.push(...[...value.matchAll(KNOWN_HOST_WORD)].map((m) => m[0]));
  return found.map((h) => h.toLowerCase()).filter((h) => !isPlaceholderHost(h));
}

/** Only the placeholders, or a MediaBrowser/Emby header of `Key="value"` pairs whose tokens are
 * the placeholder. Anything it cannot parse is not clean. */
function authorizationIsClean(value: string): boolean {
  if ([PLACEHOLDER, `Bearer ${PLACEHOLDER}`, `Basic ${PLACEHOLDER}`].includes(value)) return true;
  const m = /^(?:MediaBrowser|Emby)\s+(.*)$/i.exec(value);
  if (!m) return false;
  return (m[1] ?? '').split(/\s*,\s*/).every((pair) => {
    const kv = /^(\w+)="([^"]*)"$/.exec(pair);
    if (!kv) return false;
    return !/token/i.test(kv[1] ?? '') || kv[2] === PLACEHOLDER;
  });
}

function containsName(value: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(value);
}

function scanString(
  value: string,
  key: string | undefined,
  fields: boolean,
  add: (k: FindingKind) => void,
  names: readonly string[],
) {
  if ([...value.matchAll(JWT)].some((m) => !isTestSignedJwt(m[0]))) add('jwt');
  if (names.some((name) => name.length > 1 && containsName(value, name))) add('name');
  if ([...value.matchAll(IPV4)].some((m) => !isAllowedIp(m[0])) || ipv6Leaks(value).length > 0) {
    add('ip');
  }
  const hostValue =
    fields && key !== undefined && HOST_FIELD.test(key) && HOSTNAME_VALUE.test(value);
  const bare = value.replace(/:\d+$/, '');
  if (
    hosts(value).some((h) => !ALLOWED_HOSTS.has(h)) ||
    (hostValue && !isPlaceholderHost(bare) && !/^[\d.]+$/.test(bare))
  ) {
    add('host');
  }
  if ([...value.matchAll(EMAIL)].some((m) => m[0] !== PLACEHOLDER_EMAIL)) add('email');
  if ([...value.matchAll(HOME_PATH)].some((m) => m[4] !== PLACEHOLDER_HOME_USER)) add('home-path');
  for (const [, , name = '', v = ''] of value.matchAll(QUERY_PARAM)) {
    if ((SECRET_QUERY_KEY.test(name) && v !== '' && v !== PLACEHOLDER) || isOpaque(v)) {
      add('query-secret');
    }
  }
}

export function scanRecording(recording: Recording, options: ScanOptions = {}): Finding[] {
  const names = options.names ?? [];
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const add = (kind: FindingKind, path: string) => {
    if (seen.has(`${kind} ${path}`)) return;
    seen.add(`${kind} ${path}`);
    findings.push({ kind, path });
  };

  /** Walks any JSON value; `fields` checks token-like and host keys (bodies, the top level). */
  const walk = (value: unknown, key: string | undefined, path: string, fields: boolean) => {
    const secretKey = fields && key !== undefined && SECRET_BODY_KEY.test(key);
    if (typeof value === 'number' && secretKey) add('secret-field', path);
    if (typeof value === 'string') {
      const testSigned = isTestSignedJwt(value);
      if (secretKey && value.length > 0 && value !== PLACEHOLDER && !testSigned) {
        add('secret-field', path);
      }
      scanString(value, key, fields, (k) => add(k, path), names);
      // A re-signed ID token is allowed, and its claims are scanned like any body.
      if (testSigned) walk(jwtClaims(value), undefined, `${path}#claims`, true);
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
    if ((SECRET_QUERY_KEY.test(k) && v !== PLACEHOLDER) || isOpaque(v)) add('query-secret', path);
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
      else if (lower === 'authorization') {
        if (!authorizationIsClean(value)) add('secret-field', path);
      } else if (SECRET_QUERY_KEY.test(lower) && value !== PLACEHOLDER) add('secret-field', path);
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
