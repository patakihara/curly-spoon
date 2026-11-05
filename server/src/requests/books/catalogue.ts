/**
 * What Search lists of the books the library lacks: Audible's keyword search, kept five minutes, and
 * for each book found the row a person sees. Audible holds the ASIN a request needs, and the indexers
 * do not. A search waits for it only up to the limit, and anything going wrong is no rows, never a
 * failed search. A row's cover comes from the address in the parsed product, never from a client.
 *
 * A book the household holds is left out, by its ASIN and then by its title and author, treating "not
 * sure" as owned (the plan's Discovery page): the same title with no author named on one side counts,
 * as it would be worse to offer what you have than to miss another edition.
 */
import type { RequestRef, RequestStatus, SearchBook } from '@auralis/schema';
import { RequestRef as RequestRefSchema } from '@auralis/schema';
import {
  type AudibleClient,
  type AudibleProduct,
  cleanTitle,
} from '../../adapters/audible/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { readCapped } from '../../adapters/http/publicFetch.js';
import type { JobLog } from '../../jobs/schedule.js';
import { indexedRow, topLevelOfKind } from '../../libraryIndex/store.js';
import type { Db } from '../../store/connection.js';
import { arrivedRequests, liveRequest, peopleOn } from '../../store/requests.js';
import { searchFold, searchTokens } from '../../text/fold.js';

const SEARCH_LIMIT_MS = 3_000;
const KEPT_MS = 5 * 60_000;
const MOST_KEPT = 200;
const ART_LIMIT_MS = 5_000;
const MAX_ART_BYTES = 2 * 1024 * 1024;

export interface BookArt {
  type: string;
  bytes: Uint8Array;
}

export interface BookCatalogue {
  /** The books this search finds; none past the limit, on any failure, or once `gone` aborts. */
  search(q: string, gone: AbortSignal): Promise<AudibleProduct[]>;
  /** A found book's cover; null when there is none to give. */
  art(asin: string, gone: AbortSignal): Promise<BookArt | null>;
}

export interface BookCatalogueDeps {
  audible: Pick<AudibleClient, 'search' | 'product'>;
  /** Asks an address Audible wrote: `publicFetch` where it runs. */
  fetchArt: FetchLike;
  now: () => number;
  log: JobLog;
  limitMs?: number;
}

/** Forgets the oldest once the map is full; a map keeps the order things were added in. */
function remember<V>(kept: Map<string, V>, key: string, value: V): void {
  kept.delete(key);
  kept.set(key, value);
  const oldest = kept.keys().next().value;
  if (kept.size > MOST_KEPT && oldest !== undefined) kept.delete(oldest);
}

export function bookCatalogue(deps: BookCatalogueDeps): BookCatalogue {
  const { audible, fetchArt, now, log } = deps;
  const limitMs = deps.limitMs ?? SEARCH_LIMIT_MS;
  const searches = new Map<string, { at: number; found: Promise<AudibleProduct[]> }>();
  const covers = new Map<string, string>();

  const ask = (q: string, key: string) => {
    const found = audible.search(q, limitMs).then((products) => {
      for (const { asin, imageUrl } of products) {
        if (imageUrl !== null) remember(covers, asin, imageUrl);
      }
      return products;
    });
    // A failure is not kept: the next search asks again.
    found.catch(() => searches.delete(key));
    remember(searches, key, { at: now(), found });
    return found;
  };

  return {
    async search(q, gone) {
      const key = searchFold(q);
      const kept = searches.get(key);
      const found = kept !== undefined && now() - kept.at < KEPT_MS ? kept.found : ask(q, key);
      let timer: NodeJS.Timeout | undefined;
      let stop: () => void = () => undefined;
      // The injected fetch may ignore every signal, so the limit is held here as well.
      const stopped = new Promise<AudibleProduct[]>((resolve) => {
        stop = () => resolve([]);
        timer = setTimeout(stop, limitMs);
        gone.addEventListener('abort', stop, { once: true });
      });
      try {
        return await Promise.race([found, stopped]);
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no book rows');
        return [];
      } finally {
        clearTimeout(timer);
        gone.removeEventListener('abort', stop);
      }
    },

    async art(asin, gone) {
      try {
        const url = covers.get(asin) ?? (await audible.product(asin))?.imageUrl ?? null;
        if (url === null) return null;
        const response = await fetchArt(url, {
          redirect: 'manual',
          signal: AbortSignal.any([gone, AbortSignal.timeout(ART_LIMIT_MS)]),
        });
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.startsWith('image/')) {
          await response.body?.cancel();
          return null;
        }
        const bytes = await readCapped(response, MAX_ART_BYTES);
        return bytes === null ? null : { type, bytes };
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no book cover');
        return null;
      }
    },
  };
}

const ARTICLES = new Set(['the', 'a', 'an']);

/** A title's words, without its article, its edition note, a narrator's tag, or "and" for "&". */
const titleKey = (title: string) => {
  const words = searchTokens(
    cleanTitle(title)
      .replace(/\s*\[[^\]]*\]\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, ''),
  ).filter((word) => word !== 'and');
  return (ARTICLES.has(words[0] ?? '') ? words.slice(1) : words).join(' ');
};

/** The title as given and without its subtitle, either of which may name the same book. */
const titleKeys = (title: string) =>
  [titleKey(title), titleKey(title.split(/:|\s[-–—]\s/)[0] ?? '')].filter((key) => key !== '');

const surname = (name: string) => searchTokens(name).at(-1) ?? '';

interface OwnedBook {
  asin: string | undefined;
  titles: string[];
  surnames: string[];
}

function ownedBooks(db: Db): OwnedBook[] {
  return topLevelOfKind(db, 'book').map((row) => ({
    asin: row.ids['asin'],
    titles: titleKeys(row.title),
    surnames: row.creators.filter(({ role }) => role === 'author').map(({ name }) => surname(name)),
  }));
}

function isOwned(product: AudibleProduct, owned: readonly OwnedBook[]): boolean {
  const titles = titleKeys(product.title);
  const surnames = product.authors.map(({ name }) => surname(name));
  return owned.some((book) => {
    if (book.asin === product.asin) return true;
    if (!book.titles.some((title) => titles.includes(title))) return false;
    if (book.surnames.length === 0 || surnames.length === 0) return true;
    return book.surnames.some((name) => surnames.includes(name));
  });
}

/**
 * Where this person should see a request for this book stand, or null. Anyone's request under way
 * shows, as tapping joins it; a failed one only to those on it, as anyone else may ask again; and one
 * that reached the library only to those on it, while the index still holds it.
 */
function requestStanding(
  db: Db,
  userId: string,
  ref: RequestRef,
  owned: boolean,
): { status: RequestStatus; progress: number | null } | null | 'owned' {
  const live = liveRequest(db, ref);
  const isMine = (id: string) => peopleOn(db, id).includes(userId);
  if (live !== undefined && live.state.status !== 'failed') {
    const progress = live.state.status === 'downloading' ? live.state.progress : null;
    return { status: live.state.status, progress };
  }
  const arrived = arrivedRequests(db, ref).some(
    ({ id, result }) =>
      result !== null && isMine(id) && indexedRow(db, result.source, result.id) !== undefined,
  );
  if (arrived) return { status: 'inLibrary', progress: null };
  if (owned) return 'owned';
  return live !== undefined && isMine(live.id) ? { status: 'failed', progress: null } : null;
}

/** The rows these found books make for this person, in the order they were found. */
export function bookRows(
  db: Db,
  userId: string,
  products: readonly AudibleProduct[],
): SearchBook[] {
  if (products.length === 0) return [];
  const owned = ownedBooks(db);
  return products.flatMap((product) => {
    const author = product.authors[0]?.name ?? null;
    const ref = RequestRefSchema.safeParse({
      medium: 'book',
      target: { title: product.title, creator: author, ids: { asin: product.asin } },
    });
    if (!ref.success) return [];
    const standing = requestStanding(db, userId, ref.data, isOwned(product, owned));
    if (standing === 'owned') return [];
    return [
      {
        ref: ref.data,
        title: product.title,
        author,
        narrator: product.narrators[0] ?? null,
        year: product.year,
        art: product.imageUrl === null ? null : `/api/search/books/${product.asin}/art`,
        status: standing?.status ?? null,
        progress: standing?.progress ?? null,
      },
    ];
  });
}
