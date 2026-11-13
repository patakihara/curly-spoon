/**
 * A book request's search step. Audible names the book by its ASIN, and a request's title and author,
 * a client's text, are never sent on; Prowlarr lists releases; AudiobookBay's detail pages say who reads
 * the likeliest few and how. A book Audible does not know has no release, and Prowlarr is not asked. An
 * upstream that cannot be reached throws `StepUnavailable` and holds the request; only the pages are optional.
 */
import { createHash } from 'node:crypto';
import type { AudibleClient, AudibleProduct } from '../../adapters/audible/client.js';
import { readDetail } from '../../adapters/audiobookbay/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import type { ProwlarrClient, ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import type { MediumSteps, Release, SearchOutcome } from '../steps.js';
import { type BookFacts, pickRelease, type PickRow, rankRows } from './pick.js';

/** Newznab's audiobook category, the one a book is searched in. */
const AUDIOBOOKS = 3030;
/** The one indexer whose pages are read. */
const AUDIOBOOKBAY = 'AudioBook Bay';
const PAGES_READ = 3;
/** The most a person is offered. */
const MAX_CANDIDATES = 10;

export interface BookSearchDeps {
  audible: Pick<AudibleClient, 'product'>;
  prowlarr: Pick<ProwlarrClient, 'search'>;
  /** Fetches detail pages. */
  fetch: FetchLike;
  log?: JobLog;
}

const factsOf = (product: AudibleProduct): BookFacts => ({
  title: product.title,
  authors: product.authors.map((author) => author.name),
  narrators: product.narrators,
  runtimeMinutes: product.runtimeMinutes,
  language: product.language,
});

function sizeOf(release: ProwlarrRelease): number | null {
  const { size } = release;
  return size !== null && Number.isSafeInteger(size) && size >= 0 ? size : null;
}

/** A release to store. Its details hold a download's address: never log them. */
function toRelease({ release, extras }: PickRow): Release {
  const details = { ...release.details, ...extras };
  return {
    id: createHash('sha256').update(JSON.stringify(release.details)).digest('hex').slice(0, 32),
    title: release.title,
    source: release.source,
    size: sizeOf(release),
    details,
  };
}

/** The likeliest few rows from the indexer with pages, each with what its page says. */
async function withExtras(deps: BookSearchDeps, found: ProwlarrRelease[], facts: BookFacts) {
  const rows: PickRow[] = found.map((release) => ({ release, extras: {} }));
  const worthReading = rankRows(rows, facts)
    .filter(({ release }) => release.source === AUDIOBOOKBAY && release.infoUrl !== null)
    .slice(0, PAGES_READ);
  await Promise.all(
    worthReading.map(async (row) => {
      row.extras = await readDetail(deps.fetch, row.release.infoUrl as string, deps.log);
    }),
  );
  return rows;
}

export function bookSearch(deps: BookSearchDeps): MediumSteps['search'] {
  return async (request): Promise<SearchOutcome> => {
    const { asin } = request.target.ids;
    const product = asin === undefined ? null : await deps.audible.product(asin);
    if (product === null) return { kind: 'none', reason: 'noRelease' };
    const facts = factsOf(product);
    const query = [facts.title, facts.authors[0]].filter(Boolean).join(' ');
    const rows = await withExtras(
      deps,
      await deps.prowlarr.search(query, { categories: [AUDIOBOOKS] }),
      facts,
    );
    const picked = pickRelease(rows, facts);
    if (picked.kind === 'none') return { kind: 'none', reason: 'noRelease' };
    if (picked.kind === 'choose') {
      const offered = rankRows(rows, facts).slice(0, MAX_CANDIDATES);
      return { kind: 'choose', candidates: offered.map(toRelease) };
    }
    return {
      kind: 'picked',
      release: toRelease(picked.best),
      others: picked.others.map(toRelease),
    };
  };
}
