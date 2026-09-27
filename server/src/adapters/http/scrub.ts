/**
 * Turns a raw captured call into a Recording safe to commit to a public repo. In order: the
 * exact secrets the recorder was given, the upstream's own address, token-like query keys and
 * body fields, then in every string: secret query parameters inside URLs, private hosts, IP
 * addresses, emails and home folders. Headers are an allowlist. Idempotent, with fixed
 * placeholders. Item ids, titles, durations, mime types, media paths and published book metadata
 * stay: tests need them. The scan (`scan.ts`) is the backstop for anything missed here.
 */
import { isIPv6 } from 'node:net';
import { type RecordedBody, type Recording, recordingSchema } from './recording.js';

export const PLACEHOLDER = '<token>';
export const PLACEHOLDER_ORIGIN = 'http://upstream.invalid';
export const PLACEHOLDER_HOST = 'upstream.invalid';
export const PLACEHOLDER_IP = '192.0.2.1';
export const PLACEHOLDER_IPV6 = '2001:db8::1';
export const PLACEHOLDER_EMAIL = 'user@upstream.invalid';
export const PLACEHOLDER_HOME_USER = 'user';

/** The only headers a recording keeps, in either direction. */
export const KEPT_HEADERS = ['accept', 'content-type', 'authorization'] as const;
/** A query parameter or header name that carries a credential. `auth` spares `author`. */
export const SECRET_QUERY_KEY = /token|key|secret|pass|pash|auth(?!or)|cookie|signature/i;
/** A JSON field that carries a credential, by substring or by exact name. */
export const SECRET_BODY_KEY =
  /token|api_?key|password|passwd|pash|secret|cookie|authorization|^key$|^pass$/i;
/** A JSON field whose value is a host or an address. */
export const HOST_FIELD = /host|address|^addr$|servername|domain|origin|endpoint|url$/i;
/** Four octets only, so versions such as 2.36.1 or 10.11.11 never match. */
export const IPV4 = /(?<!\d|\d\.)(?:\d{1,3}\.){3}\d{1,3}(?!\.?\d)/g;
/**
 * Candidates only; `isIPv6` decides. Needs two colons, so clocks like 12:30:00 fail `isIPv6`.
 * A dotted IPv4 tail (`::ffff:10.1.2.3`) is part of the candidate, never cut off at its first dot.
 */
export const IPV6_CANDIDATE =
  /(?<![\w:])(?:[0-9a-f]{0,4}:){2,7}(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{0,4}(?!\.\d))(?![\w:])/gi;
/** An IPv4-mapped IPv6 address; it leaks exactly when its IPv4 part does. */
const IPV4_MAPPED = /^::ffff:((?:\d{1,3}\.){3}\d{1,3})$/i;
/** Any address, dotted domain or not (`someone@box` too). */
export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*/g;
/** `/home/<user>` and `/Users/<user>`, raw or URL-encoded. */
export const HOME_PATH = /(\/|%2F)(home|Users)(\/|%2F)([^/%\s"'?#&<>]+)/gi;
/** A query parameter inside any string: its separator, name and value. */
export const QUERY_PARAM = /([?&;])([^=&#\s"'<>?;]+)=(<token>|[^&#\s"'<>;]*)/g;
/**
 * Host names this household's servers answer to, already named publicly in this repo's docs.
 * Everything else is found by shape.
 */
export const KNOWN_HOST_WORDS = ['mediaserver'] as const;
export const KNOWN_HOST_WORD = new RegExp(
  `(?<![\\w.-])(?:${KNOWN_HOST_WORDS.join('|')})(?![\\w-])`,
  'gi',
);
/** A tailnet's MagicDNS names are private by nature. */
const TAILNET_HOST = /(?<![\w.-])(?:[a-z0-9-]+\.)+ts\.net(?![\w-])/gi;
/** A whole value shaped like a host name, with an optional port. */
export const HOSTNAME_VALUE =
  /^(?=.*[a-z])[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*(?::\d+)?$/i;
/** An http(s) URL's host, for single-label and private hosts inside strings. */
const URL_HOST = /(https?:\/\/)([^/\s:"'?#<>[\]]+)/gi;
const PRIVATE_SUFFIX = /\.(?:lan|local|home|internal|arpa|localdomain)$/i;

/** Loopback and the three documentation ranges (RFC 5737); a non-address is not "allowed". */
export function isAllowedIp(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o > 255)) return true;
  const [a, b, c] = octets as [number, number, number, number];
  if (a === 127) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  return false;
}

/** Every real IPv6 address in `value` except loopback, unspecified and documentation. */
export function ipv6Leaks(value: string): string[] {
  return [...value.matchAll(IPV6_CANDIDATE)]
    .map((m) => m[0])
    .filter((c) => {
      const mapped = IPV4_MAPPED.exec(c);
      if (mapped) return !isAllowedIp(mapped[1] as string);
      return isIPv6(c) && c !== '::' && c !== '::1' && !/^2001:db8:/i.test(c);
    });
}

/** True for a host that is allowed to stay in a recording as it is. */
export function isPlaceholderHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === PLACEHOLDER_HOST || h === 'localhost' || h === '127.0.0.1';
}

export interface RawExchange {
  upstream: string;
  upstreamVersion: string;
  call: string;
  request: {
    method: string;
    /** The full URL as sent, base URL and query included. */
    url: string;
    headers: Record<string, string>;
    body: RecordedBody;
  };
  response: { status: number; headers: Record<string, string>; body: RecordedBody };
}

export interface ScrubOptions {
  /** Every key the recorder was given; each is replaced wherever it appears. */
  secrets: string[];
  /** The upstream's base URL; its origin, host and hostname become upstream.invalid. */
  baseUrl: string;
}

function keepHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (!(KEPT_HEADERS as readonly string[]).includes(lower)) continue;
    out[lower] = lower === 'authorization' ? rewriteAuthorization(value) : value;
  }
  return sortKeys(out);
}

/**
 * `Bearer x` and `Basic x` keep their scheme; `MediaBrowser` and `Emby` keep their fields but
 * every token, quoted or not, in any case, becomes the placeholder. Anything else is the bare
 * placeholder.
 */
function rewriteAuthorization(value: string): string {
  if (/^bearer\s/i.test(value)) return `Bearer ${PLACEHOLDER}`;
  if (/^basic\s/i.test(value)) return `Basic ${PLACEHOLDER}`;
  if (/^(mediabrowser|emby)\s/i.test(value)) {
    return value.replace(/\b(token)\s*=\s*(?:"[^"]*"|[^,\s]*)/gi, `$1="${PLACEHOLDER}"`);
  }
  return PLACEHOLDER;
}

function sortKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replaces every form of each secret, and the upstream's address, in serialized JSON. */
function replaceLiterals(json: string, { secrets, baseUrl }: ScrubOptions): string {
  let out = json;
  for (const secret of secrets.filter((s) => s.length > 0)) {
    const forms = new Set([
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
      Buffer.from(secret).toString('base64'),
      Buffer.from(secret).toString('base64url'),
    ]);
    for (const form of [...forms].sort((a, b) => b.length - a.length)) {
      out = out.split(form).join(PLACEHOLDER);
    }
  }
  const base = new URL(baseUrl);
  out = out.split(base.origin).join(PLACEHOLDER_ORIGIN);
  for (const bare of new Set([base.host, base.hostname])) {
    out = out.replace(
      new RegExp(`(?<![\\w.-])${escapeRegExp(bare)}(?![\\w-]|\\.\\w)`, 'g'),
      PLACEHOLDER_HOST,
    );
  }
  return out;
}

/** A URL host that names a private machine: one label, a private suffix, or an address. */
function isPrivateUrlHost(host: string): boolean {
  if (isPlaceholderHost(host)) return false;
  return !host.includes('.') || PRIVATE_SUFFIX.test(host) || /^[\d.]+$/.test(host);
}

/** Scrubs one string wherever it sits: query secrets, hosts, addresses, emails, home folders. */
export function scrubString(value: string): string {
  return value
    .replace(QUERY_PARAM, (all, sep: string, name: string) =>
      SECRET_QUERY_KEY.test(name) ? `${sep}${name}=${PLACEHOLDER}` : all,
    )
    .replace(EMAIL, (e) => (e === PLACEHOLDER_EMAIL ? e : PLACEHOLDER_EMAIL))
    .replace(TAILNET_HOST, PLACEHOLDER_HOST)
    .replace(KNOWN_HOST_WORD, PLACEHOLDER_HOST)
    .replace(URL_HOST, (all, scheme: string, host: string) =>
      isPrivateUrlHost(host) ? `${scheme}${PLACEHOLDER_HOST}` : all,
    )
    .replace(IPV4, (ip) => (isAllowedIp(ip) ? ip : PLACEHOLDER_IP))
    .replace(IPV6_CANDIDATE, (c) => (ipv6Leaks(c).length > 0 ? PLACEHOLDER_IPV6 : c))
    .replace(
      HOME_PATH,
      (_all, s1: string, dir: string, s2: string) => `${s1}${dir}${s2}${PLACEHOLDER_HOME_USER}`,
    );
}

/** Walks a JSON value: every string is scrubbed; with `fields`, token-like and host keys too. */
function walk(value: unknown, key: string | undefined, fields: boolean): unknown {
  const secretKey = fields && key !== undefined && SECRET_BODY_KEY.test(key);
  if (typeof value === 'number' && secretKey) return PLACEHOLDER;
  if (typeof value === 'string') {
    if (secretKey && value.length > 0) return PLACEHOLDER;
    const out = scrubString(value);
    if (fields && key !== undefined && HOST_FIELD.test(key) && HOSTNAME_VALUE.test(out)) {
      const host = out.replace(/:\d+$/, '');
      if (!isPlaceholderHost(host) && !/^[\d.]+$/.test(host)) return PLACEHOLDER_HOST;
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key, fields));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k, fields)]));
  }
  return value;
}

function scrubBody(body: RecordedBody): RecordedBody {
  if (body === null) return null;
  if ('text' in body) return { text: scrubString(body.text) };
  return { json: walk(body.json, undefined, true) };
}

export function scrub(raw: RawExchange, options: ScrubOptions): Recording {
  const url = new URL(raw.request.url);
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) query[k] = SECRET_QUERY_KEY.test(k) ? PLACEHOLDER : v;

  const shaped: Recording = {
    upstream: raw.upstream,
    upstreamVersion: raw.upstreamVersion,
    call: raw.call,
    request: {
      method: raw.request.method.toUpperCase(),
      path: url.pathname,
      query: sortKeys(query),
      headers: keepHeaders(raw.request.headers),
      body: raw.request.body,
    },
    response: {
      status: raw.response.status,
      headers: keepHeaders(raw.response.headers),
      body: raw.response.body,
    },
  };

  const literal = JSON.parse(replaceLiterals(JSON.stringify(shaped), options)) as Recording;
  return recordingSchema.parse({
    ...literal,
    request: {
      ...literal.request,
      path: scrubString(literal.request.path),
      query: walk(literal.request.query, undefined, false),
      headers: walk(literal.request.headers, undefined, false),
      body: scrubBody(literal.request.body),
    },
    response: {
      ...literal.response,
      headers: walk(literal.response.headers, undefined, false),
      body: scrubBody(literal.response.body),
    },
  });
}
