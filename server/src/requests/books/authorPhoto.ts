/**
 * An author's photo, from Audnexus by the author's ASIN: `author.jpg` in their folder when it has
 * none. Only a square JPEG, read from its own header: the command would rather report than use a
 * poor image, and the image holds no `ffmpeg` to crop one. All of this is soft, never failing a
 * request. The address is another service's text and Audiobookshelf is handed it too, so it must be
 * https to a public address, a redirect is not followed, and no more than the cap is ever read.
 */
import { randomBytes } from 'node:crypto';
import { link, lstat, rm, writeFile } from 'node:fs/promises';
import { BlockList, isIP } from 'node:net';
import { join } from 'node:path';
import type { AudnexusClient } from '../../adapters/audnexus/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import type { JobLog } from '../../jobs/schedule.js';

const PHOTO_FILE = 'author.jpg';
const PHOTO_LIMIT_MS = 10_000;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const JPEG_START = 0xd8;
/** The markers that hold a JPEG's size: start of frame, but for those that share the range. */
const isFrameMarker = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

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

const isPublicAddress = (address: string) =>
  !NOT_PUBLIC.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');

/** Why this address may not be fetched, or null. A name with no dot is a container's or the LAN's. */
async function refusedAddress(url: URL, lookup: AuthorPhotoDeps['lookup']): Promise<string | null> {
  if (url.protocol !== 'https:') return 'not https';
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(host) !== 0) return isPublicAddress(host) ? null : 'a private address';
  if (!host.includes('.') || /\.(?:localhost|local|internal|lan)$/i.test(host)) {
    return 'a private address';
  }
  const addresses = lookup === undefined ? [] : await lookup(host);
  return addresses.every(isPublicAddress) ? null : 'a private address';
}

/** The body, reading no further than the cap whatever its length says; null past it. */
async function readCapped(response: Response): Promise<Uint8Array | null> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    total += value.byteLength;
    if (total > MAX_PHOTO_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}

/** Whether these bytes open a JPEG with equal sides. */
export function isSquareJpeg(bytes: Uint8Array): boolean {
  const data = Buffer.from(bytes);
  if (data[0] !== 0xff || data[1] !== JPEG_START) return false;
  let at = 2;
  while (at + 9 <= data.length) {
    if (data[at] !== 0xff) return false;
    const marker = data[at + 1] as number;
    if (marker === 0xff) {
      at += 1;
    } else if (isFrameMarker(marker)) {
      return data.readUInt16BE(at + 5) === data.readUInt16BE(at + 7);
    } else {
      at += 2 + data.readUInt16BE(at + 2);
    }
  }
  return false;
}

export interface AuthorPhotoDeps {
  audnexus: Pick<AudnexusClient, 'author'>;
  fetch: FetchLike;
  /** What a name resolves to, so a public-looking name for a private address is refused too. */
  lookup?: (host: string) => Promise<string[]>;
  log?: JobLog;
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/** Writes the file whole, and never over one that is there. */
async function writeNew(path: string, bytes: Uint8Array): Promise<void> {
  const temporary = `${path}.${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temporary, bytes);
    await link(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

/** The photo's address when it passed the rule, so Audiobookshelf can be given it too; else null. */
export async function authorPhoto(
  { audnexus, fetch, lookup, log }: AuthorPhotoDeps,
  { authorDir, asin }: { authorDir: string; asin: string },
): Promise<string | null> {
  try {
    const url = (await audnexus.author(asin))?.imageUrl ?? null;
    if (url === null) return null;
    const skipped = (why: string) => {
      log?.error({ why }, 'the author photo was skipped');
      return null;
    };
    const refused = await refusedAddress(new URL(url), lookup);
    if (refused !== null) return skipped(refused);
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PHOTO_LIMIT_MS),
    });
    if (!response.ok) return skipped(`answered ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_PHOTO_BYTES) return skipped('too big');
    const bytes = await readCapped(response);
    if (bytes === null) return skipped('too big');
    if (!isSquareJpeg(bytes)) return skipped('not a square JPEG');
    const path = join(authorDir, PHOTO_FILE);
    if (!(await exists(path))) await writeNew(path, bytes);
    return url;
  } catch (err) {
    log?.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no author photo');
    return null;
  }
}
