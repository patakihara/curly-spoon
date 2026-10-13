/**
 * Search and suggestions over the household's whole library index, read with no upstream call:
 * a result the signed-in person's own accounts can't play still shows. A search is kept among the
 * person's recent searches once its results are ready; a suggestion keeps nothing.
 */
import { getSearch, getSearchSuggest } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { serve } from '../route.js';
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
    // Aborts when the client goes before the answer is sent, so a source can stop asking.
    const gone = new AbortController();
    reply.raw.once('close', () => {
      if (!reply.raw.writableFinished) gone.abort();
    });
    const asked = query.kinds === undefined ? { q: query.q } : { q: query.q, kinds: query.kinds };
    const lists = await Promise.all(sources.map((source) => source.search(asked, gone.signal)));
    recordSearch(db, user.id, query.q, now());
    return { query: query.q, results: rank(lists) };
  });
}
