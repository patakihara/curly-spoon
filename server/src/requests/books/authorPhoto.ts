/**
 * An author's photo, from Audnexus by the author's ASIN: `author.jpg` in their folder when it has
 * none. Only a square JPEG, read from its own header: the command would rather report than use a
 * poor image, and the image holds no `ffmpeg` to crop one. All of this is soft, never failing a
 * request.
 */
import { randomBytes } from 'node:crypto';
import { link, lstat, rm, writeFile } from 'node:fs/promises';
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
  { audnexus, fetch, log }: AuthorPhotoDeps,
  { authorDir, asin }: { authorDir: string; asin: string },
): Promise<string | null> {
  try {
    const url = (await audnexus.author(asin))?.imageUrl ?? null;
    if (url === null) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_LIMIT_MS) });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!response.ok || bytes.length > MAX_PHOTO_BYTES || !isSquareJpeg(bytes)) {
      log?.error({ status: response.status, bytes: bytes.length }, 'the author photo was skipped');
      return null;
    }
    const path = join(authorDir, PHOTO_FILE);
    if (!(await exists(path))) await writeNew(path, bytes);
    return url;
  } catch (err) {
    log?.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no author photo');
    return null;
  }
}
