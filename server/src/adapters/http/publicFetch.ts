/**
 * A fetch for an address some other service wrote, reaching only the public internet: https, a
 * public address, never a redirect. The name is looked up once and every address checked, and the
 * connection is held to those addresses, so a name that answers differently a moment later (DNS
 * rebinding) still cannot reach the household's own network. TLS is still checked against the name.
 * It goes through `https.request` rather than `fetch`, whose connection cannot be given an address
 * without the `undici` package.
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, type LookupFunction, isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { FetchLike } from './fetch.js';

/** Every address range that is not the public internet. */
const NOT_PUBLIC = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv6');
}

const familyOf = (address: string) => (isIP(address) === 6 ? 6 : 4);

const isPublicAddress = (address: string) =>
  !NOT_PUBLIC.check(address, familyOf(address) === 6 ? 'ipv6' : 'ipv4');

const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');

/** Why the host alone rules this out, or null. A name with no dot is a container's or the LAN's. */
function refusedHost(url: URL): string | null {
  const host = hostOf(url);
  if (isIP(host) !== 0) return isPublicAddress(host) ? null : 'a private address';
  if (!host.includes('.') || /\.(?:localhost|local|internal|lan)$/i.test(host)) {
    return 'a private address';
  }
  return null;
}

/** Why the address alone rules this out, or null: https to a public host only. */
export function refusedUrl(url: URL): string | null {
  if (url.protocol !== 'https:') return 'not https';
  return refusedHost(url);
}

/** Why a feed address alone rules it out, or null: http or https, any port, no credentials. */
export function refusedFeedUrl(url: URL): string | null {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'not http or https';
  if (url.username !== '' || url.password !== '') return 'credentials';
  return refusedHost(url);
}

/** `https.request`'s shape, so a test can hold a connection to a local server. */
export type PinnedRequest = typeof httpsRequest;

/** A name's lookup that answers only these addresses. */
const pinnedLookup = (addresses: readonly string[]): LookupFunction =>
  ((_host: string, options: { all?: boolean }, done: (...answer: unknown[]) => void) => {
    const found = addresses.map((address) => ({ address, family: familyOf(address) }));
    if (options.all === true) done(null, found);
    else done(null, found[0]?.address, found[0]?.family);
  }) as LookupFunction;

/** A GET connecting only to `addresses`, whatever the name says now. A redirect is its answer. */
export function pinnedGet(
  url: URL,
  addresses: readonly string[],
  init?: RequestInit,
  request: PinnedRequest = httpsRequest,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const asked = request(
      url,
      {
        method: 'GET',
        lookup: pinnedLookup(addresses),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        ...(init?.signal ? { signal: init.signal } : {}),
      },
      (answer) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(answer.headers)) {
          if (typeof value === 'string') headers.set(name, value);
        }
        const status = answer.statusCode ?? 502;
        const empty = status === 204 || status === 205 || status === 304;
        if (empty) answer.resume();
        // A client that stops reading has this body's stream cancelled, which closes the socket.
        const body = empty ? null : (Readable.toWeb(answer) as ReadableStream<Uint8Array>);
        resolve(new Response(body, { status, headers }));
      },
    );
    asked.on('error', reject);
    asked.end();
  });
}

export interface PublicFetchOptions {
  /** What a name resolves to, every address of it. */
  lookup: (host: string) => Promise<string[]>;
  request?: PinnedRequest;
}

/** Every address `url`'s host stands for, each one public; throws otherwise. */
async function publicAddresses(url: URL, lookup: PublicFetchOptions['lookup']): Promise<string[]> {
  const host = hostOf(url);
  const addresses = isIP(host) !== 0 ? [host] : await lookup(host);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Error('a private address');
  }
  return addresses;
}

/** The fetch, which throws when the address is not public, having asked nothing. */
export function publicFetch({ lookup, request }: PublicFetchOptions): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const refused = refusedUrl(url);
    if (refused !== null) throw new Error(refused);
    return pinnedGet(url, await publicAddresses(url, lookup), init, request);
  };
}

/** At most this many redirects are followed before a feed is refused. */
export const FEED_MAX_REDIRECTS = 5;

export interface FeedFetchOptions {
  /** What a name resolves to, every address of it. */
  lookup: (host: string) => Promise<string[]>;
  /** The request each scheme goes through, so a test can hold a connection to a local server. */
  requests?: Record<'http:' | 'https:', PinnedRequest>;
}

/** The feed's answer, and its address after permanent redirects (301, 308) only. */
export type FeedFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{ response: Response; url: string }>;

/**
 * A fetch for a feed address a client named: http or https, any port. Every hop's name is looked
 * up once, every address must be public, and the connection is held to them. Redirects are
 * followed by hand, each hop checked the same way, at most `FEED_MAX_REDIRECTS`.
 */
export function feedFetch({
  lookup,
  requests = { 'http:': httpRequest as unknown as PinnedRequest, 'https:': httpsRequest },
}: FeedFetchOptions): FeedFetch {
  return async (input, init) => {
    let url = new URL(input);
    let named = url;
    let permanent = true;
    for (let hop = 0; ; hop++) {
      const refused = refusedFeedUrl(url);
      if (refused !== null) throw new Error(refused);
      const addresses = await publicAddresses(url, lookup);
      const request = requests[url.protocol as 'http:' | 'https:'];
      const response = await pinnedGet(url, addresses, init, request);
      const location = response.headers.get('location');
      if (response.status < 300 || response.status > 399 || location === null) {
        return { response, url: named.href };
      }
      await response.body?.cancel();
      if (hop >= FEED_MAX_REDIRECTS) throw new Error('too many redirects');
      permanent &&= response.status === 301 || response.status === 308;
      url = new URL(location, url);
      if (permanent) named = url;
    }
  };
}

/** The body, reading no further than the cap whatever its length says; null past it. */
export async function readCapped(response: Response, cap: number): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
