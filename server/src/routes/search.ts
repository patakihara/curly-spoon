/**
 * Search and suggestions over the household's whole library index, read with no upstream call:
 * a result the signed-in person's own accounts can't play still shows. A search is kept among the
 * person's recent searches once its results are ready, unless they asked by HEAD or have gone; a
 * suggestion keeps nothing.
 */
import { getSearch, getSearchSuggest } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { clientGone, serve } from '../route.js';
import { librarySource } from '../search/library.js';
import { rank, type SearchSource } from '../search/sources.js';
import { suggest } from '../search/suggest.js';
import type { Db } from '../store/connection.js';
import { recordSearch } from '../store/recentSearches.js';
import { signedIn } from './auth.js';

export function searchRoutes(app: FastifyInstance, options: { db: Db; now: () => number }): void {
  const { db, now } = options;
  const sources: readonly SearchSource[] = [librarySource(db)];

  serve(app, getSearchSuggest, (request, _reply, _body, { query }) => ({
    suggestions: suggest(db, signedIn(request).id, query.q),
  }));

  serve(app, getSearch, async (request, reply, _body, { query }) => {
    const user = signedIn(request);
    const gone = clientGone(reply);
    const asked = query.kinds === undefined ? { q: query.q } : { q: query.q, kinds: query.kinds };
    const lists = await Promise.all(sources.map((source) => source.search(asked, gone)));
    // Kept only for a person who asked for the results and is still there to see them. A recent
    // search is a convenience: failing to keep one never costs the results.
    if (request.method === 'GET' && !gone.aborted) {
      try {
        recordSearch(db, user.id, query.q, now());
      } catch (err) {
        request.log.warn({ err }, 'recent search not kept');
      }
    }
    return { query: query.q, results: rank(lists) };
  });
}
