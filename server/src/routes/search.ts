/**
 * Search and suggestions over the household's whole library index, read with no upstream call:
 * every result plays, through the person's own account or Auralis's, and says whether it is in
 * their own library. A search is kept among the
 * person's recent searches once its results are ready, unless they asked by HEAD; a suggestion
 * keeps nothing. A search is kept even when its client has left: one that leaves right after
 * asking has its answer written before Node reads the close, and a written answer looks delivered
 * whether or not anyone reads it, so the server cannot tell it from one that read its results.
 * Either answer also says whether the person has any request, as the page offers them from there.
 *
 * A search, never a suggestion, also lists the books the library lacks, from the catalogue, while
 * books can be requested. It waits for that source only up to the catalogue's limit, and whatever goes
 * wrong there the library's results still answer.
 */
import {
  getSearch,
  getSearchSuggest,
  mediaRefKey,
  searchBookArt,
  type SearchBook,
  type SearchKind,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { personalView } from '../library/personal.js';
import { bookRows, type BookCatalogue } from '../requests/books/catalogue.js';
import { clientGone, Refusal, serve, serveStream } from '../route.js';
import { librarySource } from '../search/library.js';
import { rank, type SearchSource } from '../search/sources.js';
import { suggest } from '../search/suggest.js';
import type { Db } from '../store/connection.js';
import { recordSearch } from '../store/recentSearches.js';
import { requestsListed } from '../store/requests.js';
import { signedIn } from './auth.js';

/** The kinds that name someone or a series, not an item. */
const NAME_KINDS: readonly SearchKind[] = ['artist', 'author', 'series'];

/** How a book row's cover is cached: a day, by the person's own client only. */
const ART_CACHE = 'private, max-age=86400';

export function searchRoutes(
  app: FastifyInstance,
  options: { db: Db; now: () => number; catalogue?: BookCatalogue },
): void {
  const { db, now, catalogue } = options;
  const sources: readonly SearchSource[] = [librarySource(db)];

  /** The rows for this search; none for a search of other kinds, or when anything goes wrong. */
  const books = async (
    request: FastifyRequest,
    q: string,
    kinds: readonly SearchKind[] | undefined,
    userId: string,
    gone: AbortSignal,
  ): Promise<SearchBook[]> => {
    if (catalogue === undefined || (kinds !== undefined && !kinds.includes('book'))) return [];
    try {
      return bookRows(db, userId, await catalogue.search(q, gone));
    } catch (err) {
      request.log.warn({ err }, 'no book rows');
      return [];
    }
  };

  serve(app, getSearchSuggest, (request, _reply, _body, { query }) => {
    const user = signedIn(request);
    return {
      suggestions: suggest(db, user.id, query.q),
      hasRequests: requestsListed(db, user.id).length > 0,
    };
  });

  serve(app, getSearch, async (request, reply, _body, { query }) => {
    const user = signedIn(request);
    const gone = clientGone(reply);
    const asked = query.kinds === undefined ? { q: query.q } : { q: query.q, kinds: query.kinds };
    const [lists, found] = await Promise.all([
      Promise.all(sources.map((source) => source.search(asked, gone))),
      books(request, query.q, query.kinds, user.id, gone),
    ]);
    // A recent search is a convenience: failing to keep one never costs the results.
    if (request.method === 'GET') {
      try {
        recordSearch(db, user.id, query.q, now());
      } catch (err) {
        request.log.warn({ err }, 'recent search not kept');
      }
    }
    const view = personalView(db, user.id);
    const results = rank(lists);
    const names = results.some((r) => NAME_KINDS.includes(r.kind)) ? view.names() : null;
    return {
      query: query.q,
      hasRequests: requestsListed(db, user.id).length > 0,
      books: found,
      songs: [],
      streaming: 'ok' as const,
      results: results.map((result) => {
        const top = result.parent?.ref ?? result.ref;
        const inYourLibrary =
          names !== null && NAME_KINDS.includes(result.kind)
            ? view.everyone || names.has(mediaRefKey(result.ref))
            : view.holds(top);
        return { ...result, inYourLibrary };
      }),
    };
  });

  serveStream(app, searchBookArt, async (request, { params, signal }) => {
    signedIn(request);
    const art = await catalogue?.art(params.asin, signal);
    if (art === undefined || art === null) throw new Refusal(404, 'not_found');
    return {
      status: 200,
      headers: {
        'content-type': art.type,
        'content-length': String(art.bytes.byteLength),
        'cache-control': ART_CACHE,
      },
      body: new Blob([art.bytes]).stream(),
    };
  });
}
