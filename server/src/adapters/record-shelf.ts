/**
 * Record mode's `shelf` part: how Audiobookshelf is asked about a folder a request has placed, on one
 * book and its author alone. All reads but one, and that one changes nothing.
 *
 * - `newest-items`: the newest items, as the pickup reads them, cut to that book, as the rest name a
 *   household's library.
 * - `index-book-new`: that book, as the index reads it.
 * - `author-new`: its first author.
 * - `author-image-refused`: the photo update sent with the provisioning key and no address. In
 *   `AuthorController` (2.37.0) that ends in 404 for a key whose account cannot reach the library, or
 *   400 past that point, and either comes before anything is fetched or saved. The author is read
 *   again to prove it. Its success stays unrecorded until a real request.
 * - `author-doyle-image` beside `author-doyle-image.jpg`: Audnexus's photo for an author who has one,
 *   read for the first bytes alone, which hold what the square-only rule reads.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AbsClient } from './audiobookshelf/client.js';
import { authorSchema } from './audiobookshelf/schemas.js';
import { AudnexusClient, AUDNEXUS_URL } from './audnexus/client.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import type { RawExchange } from './http/scrub.js';

/** How much of the photo is kept: its header, not the whole photo. */
export const PHOTO_BYTES = 4096;
const DOYLE = 'B000AQ43GQ';
const REFUSED = [400, 404];

export interface ShelfRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  absKey: string;
  provisionKey: string;
  bookFolder: string;
}

function clean(call: string, recording: Recording): void {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const where = findings.map((one) => `${one.kind} at ${one.path}`).join(', ');
    throw new Error(`${call}: the scan found ${where}`);
  }
}

/**
 * The newest items' answer, cut to the one book and the fields the pickup reads. A book's description
 * and its files' tags go from the book's own answer, as they can name a site.
 */
function onlyBook(bookFolder: string) {
  return (raw: RawExchange): RawExchange => {
    const { body } = raw.response;
    if (body === null || !('json' in body)) return raw;
    if (raw.call === 'index-book-new') {
      const item = body.json as {
        media: { metadata: Record<string, unknown>; audioFiles: Record<string, unknown>[] };
      };
      const metadata = { ...item.media.metadata, description: null };
      const audioFiles = item.media.audioFiles.map(({ ino, duration, exclude }) => {
        return { ino, duration, exclude };
      });
      const media = { ...item.media, metadata, audioFiles };
      return { ...raw, response: { ...raw.response, body: { json: { ...item, media } } } };
    }
    if (raw.call !== 'newest-items') return raw;
    const page = body.json as { results: Record<string, unknown>[] };
    const results = page.results
      .filter((row) => row.relPath === bookFolder)
      .map(({ id, relPath, addedAt, updatedAt, mediaType }) => {
        return { id, relPath, addedAt, updatedAt, mediaType };
      });
    return {
      ...raw,
      response: {
        ...raw.response,
        body: { json: { ...page, results, total: results.length, limit: 25 } },
      },
    };
  };
}

export async function recordShelf(input: ShelfRecordInput): Promise<{ written: string[] }> {
  const { absUrl, absKey, provisionKey, bookFolder, out } = input;
  const plain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const version = await plain.getServerVersion();
  const libraries = await plain.getLibraries();
  const books = libraries.find((library) => library.mediaType === 'book');
  if (books === undefined) throw new Error('Audiobookshelf has no book library');
  const rec = createRecorder({
    fetch: input.fetch,
    dir: join(input.root, 'audiobookshelf', 'recordings'),
    upstream: 'audiobookshelf',
    upstreamVersion: version,
    secrets: [absKey, provisionKey],
    baseUrl: absUrl,
    prepare: onlyBook(bookFolder),
  });
  const abs = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: rec.fetch });
  const verify = (_result: unknown, recording: Recording) => clean(recording.call, recording);
  const rows = await rec.capture('newest-items', () => abs.newestItems(books.id, 25), { verify });
  const row = rows.find((one) => one.relPath === bookFolder);
  if (row === undefined) throw new Error('the book is not among the newest items');
  const item = await rec.capture('index-book-new', () => abs.getItemSummary(row.id), { verify });
  if (item.mediaType !== 'book') throw new Error('that item is not a book');
  const [first] = item.media.metadata.authors;
  if (first === undefined) throw new Error('the book names no author');
  const author = await rec.capture('author-new', () => abs.getAuthor(first.id), { verify });
  out(`the author ${author.imagePath === null ? 'has no photo' : 'has a photo'}`);
  authorSchema.parse(author);
  const status = await rec.capture(
    'author-image-refused',
    async () => {
      const url = new URL(`api/authors/${encodeURIComponent(first.id)}/image`, `${absUrl}/`);
      const response = await rec.fetch(url.toString(), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${provisionKey}`,
          'content-type': 'application/json',
        },
        body: '{}',
      });
      await response.text();
      return response.status;
    },
    { verify },
  );
  if (!REFUSED.includes(status)) throw new Error(`the update with no address answered ${status}`);
  const after = await plain.getAuthor(first.id);
  if (after.imagePath !== author.imagePath) throw new Error('the author changed');
  out(`the update with no address answered ${status}, and the author is as it was`);

  const nexus = new AudnexusClient({ baseUrl: AUDNEXUS_URL, fetch: input.fetch });
  const photo = (await nexus.author(DOYLE))?.imageUrl;
  if (!photo) throw new Error('Audnexus has no photo for this author');
  const dir = join(input.root, 'audnexus', 'recordings');
  const photoRec = createRecorder({
    fetch: input.fetch,
    dir,
    upstream: 'audnexus',
    upstreamVersion: 'Audnexus API, unversioned',
    secrets: [],
    baseUrl: new URL(photo).origin,
  });
  const bytes = await photoRec.capture(
    'author-doyle-image',
    async () => new Uint8Array(await (await photoRec.fetch(photo)).arrayBuffer()),
    {
      standIn: {
        bytes: 'author-doyle-image.jpg',
        synthesized: `the photo's first ${PHOTO_BYTES} bytes, which hold its header`,
      },
      verify,
    },
  );
  await writeFile(join(dir, 'author-doyle-image.jpg'), bytes.slice(0, PHOTO_BYTES));
  return {
    written: [
      'newest-items',
      'index-book-new',
      'author-new',
      'author-image-refused',
      'author-doyle-image',
    ],
  };
}
