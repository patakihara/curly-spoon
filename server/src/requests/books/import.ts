/**
 * A book request's import step. It places the finished torrent's book in Books (place.ts), and only
 * reads Audiobookshelf after that: its folder watcher finds the book by itself, about 18 s later
 * (recorded), so no path here asks for a scan. Until a new item's `relPath` is the folder, the import
 * is `waiting`; once it is, the item goes into the index and the request names it.
 *
 * The name on the shelf comes from Audible's product by ASIN, and only falls to the request's target,
 * a client's text, when there is none. Who reads the book comes from the release first, as that is
 * the audio held. A repeat of a key finds its folder by the first file's inode, and links nothing;
 * one that comes while an import past its time limit is still running waits for it to end.
 *
 * A book that was already there can be anywhere in the library, so it is looked for in all of it. If
 * Audiobookshelf has still not listed that folder an hour on it will not, and the request says so.
 */
import { lstat, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { z } from 'zod';
import type { AudibleClient, AudibleProduct } from '../../adapters/audible/client.js';
import type { AbsClient } from '../../adapters/audiobookshelf/client.js';
import type { AbsProvisioner } from '../../adapters/audiobookshelf/provision.js';
import type { AudnexusClient } from '../../adapters/audnexus/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { stepFailure } from '../../adapters/http/unavailable.js';
import type { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { indexOneAbsItem } from '../../libraryIndex/job.js';
import type { Db } from '../../store/connection.js';
import type { StoredRequest } from '../../store/requests.js';
import type { ImportOutcome, MediumSteps } from '../steps.js';
import { authorPhoto } from './authorPhoto.js';
import { BookRefused } from './names.js';
import {
  type BookToPlace,
  bookDestination,
  type PlaceBookInput,
  type PlacedBook,
  placeBook,
} from './place.js';

/** How many of a library's newest items are read for the folder. */
const NEWEST = 25;
/** The page size and the most pages read when a folder is not among the newest. */
const PAGE = 100;
const MAX_PAGES = 200;
/** How long Audiobookshelf's watcher is given before a new folder is looked for further back. */
const WATCHER_SEES_MS = 5 * 60_000;
/** How long a folder already there may have no item before the request ends with that reason. */
const NEVER_SEEN_MS = 60 * 60_000;
const PHOTO_FILE = 'author.jpg';

export interface BookImportDeps {
  audible: Pick<AudibleClient, 'product'>;
  audnexus: Pick<AudnexusClient, 'author' | 'authorsNamed'>;
  qbittorrent: Pick<QbittorrentClient, 'withHashes' | 'files'>;
  abs: Pick<AbsClient, 'getLibraries' | 'newestItems' | 'getItemSummary' | 'getAuthor'>;
  provisioner: Pick<AbsProvisioner, 'setAuthorImage'>;
  db: Db;
  /** The folder holding `Books` and `Downloads`. */
  mediaDir: string;
  /** Where qBittorrent itself sees `Downloads`. */
  downloadsPath: string;
  /** Fetches the author's photo. */
  /** Asks an address another service wrote: `publicFetch` where it runs. */
  photoFetch: FetchLike;
  /** What a photo's host resolves to. */
  /** Links a file into staging; only a test replaces it. */
  link?: PlaceBookInput['link'];
  now: () => number;
  log?: JobLog;
}

const handleSchema = z.object({ hash: z.string() });
const heardSchema = z.object({
  narrators: z.array(z.string()).optional(),
  bitrateKbps: z.number().optional(),
});

/** What a release says of the audio it holds, by its detail page and then its title. */
function heardIn(release: StoredRequest['release']) {
  if (release === null) return { narrators: [], bitrateKbps: null };
  const details = heardSchema.safeParse(release.details);
  const page = details.success ? details.data : {};
  const reader = /\b(?:read|narrated)\s+by\s+([^[\](){}\d,;|]+)/i.exec(release.title)?.[1]?.trim();
  const bitrate = /\b(\d{2,3})\s*k(?:bps|b\/s)?\b/i.exec(release.title)?.[1];
  return {
    narrators: page.narrators ?? (reader === undefined ? [] : [reader]),
    bitrateKbps: page.bitrateKbps ?? (bitrate === undefined ? null : Number(bitrate)),
  };
}

function bookToPlace(request: StoredRequest, product: AudibleProduct | null): BookToPlace {
  const heard = heardIn(request.release);
  const { title, creator, ids } = request.target;
  const asBook = {
    narrators: heard.narrators.length > 0 ? heard.narrators : (product?.narrators ?? []),
    bitrateKbps: heard.bitrateKbps,
  };
  if (product === null) {
    return {
      ...asBook,
      title,
      authors: creator === null ? [] : [creator],
      series: [],
      year: null,
      asin: ids.asin ?? null,
      language: null,
      description: null,
    };
  }
  return {
    ...asBook,
    title: product.title,
    authors: product.authors.map(({ name }) => name),
    series: product.series,
    year: product.year,
    asin: product.asin,
    language: product.language,
    description: product.description,
  };
}

/** The torrent's save path as seen from here, as it must sit in Downloads. */
function savePathHere(deps: BookImportDeps, savePath: string): string {
  const from = posix.normalize(`${deps.downloadsPath}/`);
  const path = posix.normalize(`${savePath}/`);
  if (!path.startsWith(from)) throw new BookRefused('outsideDownloads');
  return join(deps.mediaDir, 'Downloads', path.slice(from.length));
}

/** Places the book, or finds it placed when the torrent has since gone. */
async function placed(
  deps: BookImportDeps,
  request: StoredRequest,
  book: BookToPlace,
  key: string,
  signal: AbortSignal | undefined,
): Promise<PlacedBook> {
  const handle = handleSchema.safeParse(request.handle);
  const [row] = handle.success ? await deps.qbittorrent.withHashes([handle.data.hash]) : [];
  if (row === undefined) {
    const { authorName, folder, authorDir, target } = await bookDestination(deps.mediaDir, book);
    const there = await lstat(target).catch(() => null);
    if (there === null) throw new BookRefused('torrentGone');
    return { outcome: 'existing', relPath: `${authorName}/${folder}`, authorDir };
  }
  const savePath = savePathHere(deps, row.save_path);
  const { target } = await bookDestination(deps.mediaDir, book);
  const there = await lstat(target).catch(() => null);
  if (there === null && row.progress !== 1) throw new BookRefused('notComplete');
  const files = await deps.qbittorrent.files(row.hash);
  return placeBook({
    mediaDir: deps.mediaDir,
    savePath,
    files,
    key,
    book,
    ...(deps.log === undefined ? {} : { log: deps.log }),
    ...(deps.link === undefined ? {} : { link: deps.link }),
    ...(signal === undefined ? {} : { signal }),
  });
}

/** Rejects once the signal aborts; otherwise never settles. */
const aborted = (signal: AbortSignal | undefined) =>
  new Promise<never>((_resolve, reject) => {
    const stop = () => reject(new BookRefused('timedOut'));
    if (signal?.aborted) stop();
    else signal?.addEventListener('abort', stop, { once: true });
  });

/** The library's row for this folder: among the newest, or further back when that is where it is. */
async function rowOf(
  deps: BookImportDeps,
  libraryId: string,
  place: PlacedBook,
  folderAgeMs: number,
) {
  const wanted = place.relPath.normalize('NFC');
  const isWanted = ({ relPath }: { relPath: string }) => relPath.normalize('NFC') === wanted;
  const newest = await deps.abs.newestItems(libraryId, NEWEST);
  const found = newest.find(isWanted);
  if (found !== undefined || (place.outcome === 'placed' && folderAgeMs < WATCHER_SEES_MS)) {
    return found;
  }
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await deps.abs.newestItems(libraryId, PAGE, page);
    const row = rows.find(isWanted);
    if (row !== undefined) return row;
    if (rows.length < PAGE) break;
  }
  return undefined;
}

/**
 * The author's photo, once Audiobookshelf has met them: `author.jpg` when the folder has none, and
 * given to Audiobookshelf when it holds none, as it does not read that file. Never fails the request.
 */
async function photoOf(
  deps: BookImportDeps,
  authorDir: string,
  product: AudibleProduct | null,
  authorId: string | undefined,
  name: string | undefined,
): Promise<void> {
  try {
    const author = authorId === undefined ? null : await deps.abs.getAuthor(authorId);
    const wanted = author !== null && author.imagePath === null;
    const hasFile = await lstat(join(authorDir, PHOTO_FILE)).then(
      () => true,
      () => false,
    );
    if (!wanted && hasFile) return;
    const named = name === undefined ? [] : await deps.audnexus.authorsNamed(name);
    const asin = product?.authors[0]?.asin ?? (named.length === 1 ? named[0] : undefined);
    if (asin === undefined || asin === null) return;
    const url = await authorPhoto(
      {
        audnexus: deps.audnexus,
        fetch: deps.photoFetch,
        ...(deps.log === undefined ? {} : { log: deps.log }),
      },
      { authorDir, asin },
    );
    if (url !== null && wanted) await deps.provisioner.setAuthorImage(author.id, url);
  } catch (err) {
    const why = err instanceof Error ? err.message : 'unknown';
    deps.log?.error({ err: why }, 'Audiobookshelf was not given the author photo');
  }
}

export function bookImport(deps: BookImportDeps): MediumSteps['import'] {
  const reading = async <T>(call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      throw stepFailure('audiobookshelf', error);
    }
  };
  const running = new Map<string, Promise<PlacedBook>>();
  const placedOnce = async (
    request: StoredRequest,
    book: BookToPlace,
    key: string,
    signal: AbortSignal | undefined,
  ): Promise<PlacedBook> => {
    for (let earlier = running.get(key); earlier; earlier = running.get(key)) {
      await Promise.race([earlier.catch(() => undefined), aborted(signal)]);
    }
    const work = placed(deps, request, book, key, signal).finally(() => running.delete(key));
    running.set(key, work);
    return work;
  };
  return async (request, key, signal): Promise<ImportOutcome> => {
    const libraries = await reading(() => deps.abs.getLibraries());
    const library = libraries.find(({ mediaType, folders }) => {
      return (
        mediaType === 'book' &&
        folders?.some(({ fullPath }) => posix.basename(fullPath) === 'Books')
      );
    });
    if (library === undefined) throw new BookRefused('noBooksLibrary');
    if (library.settings?.disableWatcher !== false) {
      deps.log?.error({ library: library.id }, 'no watcher, so a placed book would never be found');
      throw new BookRefused('watcherOff');
    }

    const { asin } = request.target.ids;
    const product = asin === undefined ? null : await deps.audible.product(asin);
    const book = bookToPlace(request, product);
    const place = await placedOnce(request, book, key, signal);

    const folder = await stat(join(deps.mediaDir, 'Books', place.relPath));
    const folderAgeMs = deps.now() - folder.mtimeMs;
    const row = await reading(() => rowOf(deps, library.id, place, folderAgeMs));
    if (row === undefined) {
      if (place.outcome === 'existing' && folderAgeMs >= NEVER_SEEN_MS) {
        throw new BookRefused('notInLibrary');
      }
      return { kind: 'waiting' };
    }

    const item = await reading(() => indexOneAbsItem(deps.db, deps.abs, row.id, deps.now()));
    if (place.outcome === 'placed' && item.mediaType === 'book') {
      const [first] = item.media.metadata.authors;
      await photoOf(deps, place.authorDir, product, first?.id, first?.name);
    }
    return { kind: 'arrived', ref: { source: 'abs', id: row.id } };
  };
}
