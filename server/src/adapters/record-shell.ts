/**
 * Record mode's `shell` part: the upstream answers M1.shell's lists, item pages and art read,
 * all reads.
 *
 * - Audiobookshelf, as the service identity `auralis` with Auralis's own key: the books page of two,
 *   oldest added first, that holds the given book (`shell-books-page`), each listed book as the
 *   index reads it (`shell-book-<n>`), and the book's cover (`shell-cover`, body synthesized).
 * - Jellyfin, with the API key as the index asks: one page of two albums from each music library,
 *   by its id, at the page holding the given album where that library has it, else the first
 *   (`jf-library-albums-<n>`).
 * - Jellyfin, as `auralis` through a token minted by Quick Connect and logged out at the end: the
 *   person's views (`jf-user-views`) and the album's primary image (`jf-primary-image`, body
 *   synthesized).
 *
 * Only the library holding the book is listed: the Podcasts library is never listed or scanned,
 * and no audio file is opened, so no podcast stub is hydrated.
 */
import { join } from 'node:path';
import { AbsClient } from './audiobookshelf/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { RECORD_USER_ID, TEST_IDENTITY } from './record-oidc.js';

/** Audiobookshelf's cover: its body is household cover art. */
export const COVER_STAND_IN = {
  bytes: 'cover.webp',
  synthesized:
    'A 64 x 64 px mid-grey square, lossless WebP, made by scripts/fixtures/still.sh. ' +
    'Status and headers are the real answer; the body is not.',
} as const;

/** Jellyfin's primary image of an album: its body is household cover art. */
export const PRIMARY_IMAGE_STAND_IN = {
  bytes: 'primary.jpg',
  synthesized:
    'A 64 x 64 px mid-grey square, baseline JPEG, made by scripts/fixtures/still.sh. ' +
    'Status and headers are the real answer; the body is not.',
} as const;

/** How many items each unrecorded lookup reads at once, finding where an item is listed. */
const LOOKUP_PAGE = 100;

export interface ShellRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  jellyfinUrl: string;
  absKey: string;
  jellyfinKey: string;
  /** The book whose page, and whose cover, is recorded. */
  bookId: string;
  /** The album whose page, and whose primary image, is recorded. */
  albumId: string;
  /** How many items each recorded page holds: the index recordings' page size. */
  pageSize: number;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

/** Where `id` is in a list read `LOOKUP_PAGE` at a time by `page`, or undefined. */
async function positionOf(
  id: string,
  page: (start: number) => Promise<{ ids: string[]; total: number }>,
): Promise<number | undefined> {
  for (let start = 0; ; start += LOOKUP_PAGE) {
    const { ids, total } = await page(start);
    const at = ids.indexOf(id);
    if (at >= 0) return start + at;
    if (ids.length === 0 || start + ids.length >= total) return undefined;
  }
}

export async function recordShell(input: ShellRecordInput): Promise<{ written: string[] }> {
  const { absUrl, jellyfinUrl, absKey, jellyfinKey, out } = input;
  const written: string[] = [];

  const absPlain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const absVersion = await absPlain.getServerVersion();
  const me = await absPlain.getMe();
  if (me.username !== TEST_IDENTITY) {
    throw new Error(`the Audiobookshelf key belongs to ${me.username}, not ${TEST_IDENTITY}`);
  }
  const libraries = await absPlain.getLibraries();
  const book = await absPlain.getItemSummary(input.bookId);
  const library = libraries.find((l) => l.id === book.libraryId);
  if (book.mediaType !== 'book' || library?.mediaType !== 'book') {
    throw new Error(`${input.bookId} is not a book in a book library`);
  }
  const position = await positionOf(input.bookId, async (start) => {
    const page = start / LOOKUP_PAGE;
    const listed = await absPlain.getLibraryItems(library.id, {
      limit: LOOKUP_PAGE,
      page,
      sort: 'addedAt',
    });
    return { ids: listed.results.map((r) => r.id), total: listed.total };
  });
  if (position === undefined) throw new Error(`the book library does not list ${input.bookId}`);

  const absDir = join(input.root, 'audiobookshelf', 'recordings');
  const absRec = createRecorder({
    fetch: input.fetch,
    dir: absDir,
    upstream: 'audiobookshelf',
    upstreamVersion: absVersion,
    secrets: [absKey],
    baseUrl: absUrl,
  });
  const abs = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: absRec.fetch });
  const absCapture: typeof absRec.capture = async (call, fn, options) => {
    const result = await absRec.capture(call, fn, options);
    written.push(join(absDir, `${call}.json`));
    return result;
  };
  const page = Math.floor(position / input.pageSize);
  const listed = await absCapture('shell-books-page', () =>
    abs.getLibraryItems(library.id, { limit: input.pageSize, page, sort: 'addedAt' }),
  );
  out(
    `the book is item ${position + 1} of ${listed.total}, on page ${page} in pages of ${input.pageSize}`,
  );
  for (const [n, item] of listed.results.entries()) {
    await absCapture(`shell-book-${n + 1}`, () => abs.getItemSummary(item.id));
  }
  const cover = await absCapture('shell-cover', () => abs.openCover(input.bookId), {
    standIn: COVER_STAND_IN,
  });
  await cover.body.cancel();

  const jellyfinDir = join(input.root, 'jellyfin', 'recordings');
  const jfPlain = new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: input.fetch,
  });
  const jellyfinVersion = await jfPlain.getServerVersion();
  const indexRec = createRecorder({
    fetch: input.fetch,
    dir: jellyfinDir,
    upstream: 'jellyfin',
    upstreamVersion: jellyfinVersion,
    secrets: [jellyfinKey],
    baseUrl: jellyfinUrl,
  });
  const jfIndex = new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: indexRec.fetch,
  });
  const music = (await jfPlain.getLibraries()).filter((l) => l.CollectionType === 'music');
  for (const [n, lib] of music.entries()) {
    const at = await positionOf(input.albumId, async (startIndex) => {
      const albums = await jfPlain.getAlbums({ limit: LOOKUP_PAGE, startIndex, parentId: lib.Id });
      return { ids: albums.Items.map((a) => a.Id), total: albums.TotalRecordCount };
    });
    const startIndex = at === undefined ? 0 : at - (at % input.pageSize);
    const call = `jf-library-albums-${n + 1}`;
    await indexRec.capture(call, () =>
      jfIndex.getAlbums({ limit: input.pageSize, startIndex, parentId: lib.Id }),
    );
    written.push(join(jellyfinDir, `${call}.json`));
    out(
      `music library ${n + 1}: ${at === undefined ? 'no such album, first page' : `the album is item ${at + 1}`}`,
    );
  }

  const provisioner = new JellyfinProvisioner({
    baseUrl: jellyfinUrl,
    apiKey: jellyfinKey,
    fetch: input.fetch,
  });
  const identity = (await provisioner.accounts()).find((a) => a.username === TEST_IDENTITY);
  if (!identity) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  const device = personDevice(RECORD_USER_ID);
  const { token } = await provisioner.mint(identity.id, RECORD_USER_ID);
  try {
    const jfRec = createRecorder({
      fetch: input.fetch,
      dir: jellyfinDir,
      upstream: 'jellyfin',
      upstreamVersion: jellyfinVersion,
      secrets: [jellyfinKey, token],
      baseUrl: jellyfinUrl,
    });
    const jf = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: jfRec.fetch });
    await jfRec.capture('jf-user-views', () => jf.getUserViews());
    written.push(join(jellyfinDir, 'jf-user-views.json'));
    const image = await jfRec.capture('jf-primary-image', () => jf.openImage(input.albumId), {
      standIn: PRIMARY_IMAGE_STAND_IN,
    });
    await image.body.cancel();
    written.push(join(jellyfinDir, 'jf-primary-image.json'));
  } finally {
    const res = await input.fetch(url(jellyfinUrl, 'Sessions/Logout'), {
      method: 'POST',
      headers: { authorization: buildAuthorizationHeader(device, token) },
    });
    out(`logged out the minted Jellyfin token: ${res.status}`);
  }
  return { written };
}
