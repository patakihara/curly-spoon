/**
 * Turns a raw captured call into a Recording safe to commit to a public repo. In order: the
 * exact secrets the recorder was given, the upstream's own address, token-like query keys and
 * body fields, IPv4 addresses and emails. Headers are an allowlist. Idempotent. Item ids,
 * library names, media paths and published book metadata stay: tests need them.
 */
import { type RecordedBody, type Recording, recordingSchema } from './recording.js';

export const PLACEHOLDER = '<token>';
export const PLACEHOLDER_ORIGIN = 'http://upstream.invalid';
export const PLACEHOLDER_HOST = 'upstream.invalid';
export const PLACEHOLDER_IP = '192.0.2.1';
export const PLACEHOLDER_EMAIL = 'user@upstream.invalid';

/** The only headers a recording keeps, in either direction. */
export const KEPT_HEADERS = ['accept', 'content-type', 'authorization'] as const;
export const SECRET_QUERY_KEY = /^(api_?key|apikey|token|access_token)$/i;
export const SECRET_BODY_KEY = /token|api_?key|password|passwd|pash|secret|cookie|authorization/i;
export const VERSION_KEY = /version/i;
export const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
export const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

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

/** `Bearer x` and `MediaBrowser …, Token="x"` keep their scheme; anything else is a placeholder. */
function rewriteAuthorization(value: string): string {
  if (/^bearer\s/i.test(value)) return `Bearer ${PLACEHOLDER}`;
  if (/^mediabrowser\s/i.test(value))
    return value.replace(/Token="[^"]*"/g, `Token="${PLACEHOLDER}"`);
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

function scrubString(value: string, key: string | undefined): string {
  let out = value.replace(EMAIL, PLACEHOLDER_EMAIL);
  if (key === undefined || !VERSION_KEY.test(key)) {
    out = out.replace(IPV4, (ip) => (isAllowedIp(ip) ? ip : PLACEHOLDER_IP));
  }
  return out;
}

/** Walks a JSON value: IPs and emails in every string; with `fields`, token-like keys too. */
function walk(value: unknown, key: string | undefined, fields: boolean): unknown {
  if (typeof value === 'string') {
    if (fields && key !== undefined && SECRET_BODY_KEY.test(key) && value.length > 0) {
      return PLACEHOLDER;
    }
    return scrubString(value, key);
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key, fields));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k, fields)]));
  }
  return value;
}

function scrubBody(body: RecordedBody): RecordedBody {
  if (body === null) return null;
  if ('text' in body) return { text: scrubString(body.text, undefined) };
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
      path: scrubString(literal.request.path, undefined),
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
