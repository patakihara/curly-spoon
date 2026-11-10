/**
 * What Search lists of the books the library lacks: Audible's keyword search, kept five minutes, and
 * for each book found the row a person sees. Audible holds the ASIN a request needs, and the indexers
 * do not. A search waits for it only up to the limit, and anything going wrong is no rows, never a
 * failed search. A row's cover comes from the address in the parsed product, never from a client.
 *
 * A book the household holds is left out, by its ASIN and then by the words of its whole title and its
 * author, treating "not sure" as owned (the plan's Discovery page): the same words with no author named
 * on one side count. Words after a colon are the title too, as a series name before one is shared by
 * every sequel.
 */
import type { SearchBook } from '@auralis/schema';
import { RequestRef as RequestRefSchema } from '@auralis/schema';
import {
  type AudibleClient,
  type AudibleProduct,
  cleanTitle,
} from '../../adapters/audible/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { readCapped } from '../../adapters/http/publicFetch.js';
import type { JobLog } from '../../jobs/schedule.js';
import { topLevelOfKind } from '../../libraryIndex/store.js';
import type { Db } from '../../store/connection.js';
import { searchFold, searchTokens } from '../../text/fold.js';
import { requestStanding } from '../standing.js';

const SEARCH_LIMIT_MS = 3_000;
const KEPT_MS = 5 * 60_000;
const MOST_KEPT = 200;
const ART_LIMIT_MS = 5_000;
const MAX_ART_BYTES = 2 * 1024 * 1024;
/** What a cover may be: anything else could carry script, which would run on the app's own address. */
const ART_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
        const type = (response.headers.get('content-type') ?? '')
          .split(';')[0]!
          .trim()
          .toLowerCase();
        if (!response.ok || !ART_TYPES.has(type)) {
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

/**
 * The set of a whole title's words, in one order: without an article, its edition note, a narrator's
 * tag, or "and" for "&". An article goes wherever it stands, as a part after a colon may lead with one.
 */
const titleKey = (title: string) => {
  const words = searchTokens(
    cleanTitle(title)
      .replace(/\s*\[[^\]]*\]\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, ''),
  ).filter((word) => word !== 'and' && !ARTICLES.has(word));
  return [...new Set(words)].sort().join(' ');
};

const surname = (name: string) => searchTokens(name).at(-1) ?? '';

interface OwnedBook {
  asin: string | undefined;
  title: string;
  surnames: string[];
}

function ownedBooks(db: Db): OwnedBook[] {
  return topLevelOfKind(db, 'book').map((row) => ({
    asin: row.ids['asin'],
    title: titleKey(row.title),
    surnames: row.creators.filter(({ role }) => role === 'author').map(({ name }) => surname(name)),
  }));
}

function isOwned(product: AudibleProduct, owned: readonly OwnedBook[]): boolean {
  const title = titleKey(product.title);
  const surnames = product.authors.map(({ name }) => surname(name));
  return owned.some((book) => {
    if (book.asin === product.asin) return true;
    if (title === '' || book.title !== title) return false;
    if (book.surnames.length === 0 || surnames.length === 0) return true;
    return book.surnames.some((name) => surnames.includes(name));
  });
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
        item: standing?.item ?? null,
      },
    ];
  });
}
