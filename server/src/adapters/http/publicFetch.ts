/**
 * A fetch for an address some other service wrote, reaching only the public internet: https, a
 * public address, never a redirect. The name is looked up once and every address checked, and the
 * connection is held to those addresses, so a name that answers differently a moment later (DNS
 * rebinding) still cannot reach the household's own network. TLS is still checked against the name.
 * It goes through `https.request` rather than `fetch`, whose connection cannot be given an address
 * without the `undici` package.
 */
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
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  NOT_PUBLIC.addSubnet(address, prefix, 'ipv6');
}

const familyOf = (address: string) => (isIP(address) === 6 ? 6 : 4);

const isPublicAddress = (address: string) =>
  !NOT_PUBLIC.check(address, familyOf(address) === 6 ? 'ipv6' : 'ipv4');

const hostOf = (url: URL) => url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');

/** Why the address alone rules this out, or null. A name with no dot is a container's or the LAN's. */
export function refusedUrl(url: URL): string | null {
  if (url.protocol !== 'https:') return 'not https';
  const host = hostOf(url);
  if (isIP(host) !== 0) return isPublicAddress(host) ? null : 'a private address';
  if (!host.includes('.') || /\.(?:localhost|local|internal|lan)$/i.test(host)) {
    return 'a private address';
  }
  return null;
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

/** The fetch, which throws when the address is not public, having asked nothing. */
export function publicFetch({ lookup, request }: PublicFetchOptions): FetchLike {
  return async (input, init) => {
    const url = new URL(input);
    const refused = refusedUrl(url);
    if (refused !== null) throw new Error(refused);
    const host = hostOf(url);
    const addresses = isIP(host) !== 0 ? [host] : await lookup(host);
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new Error('a private address');
    }
    return pinnedGet(url, addresses, init, request);
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
