/**
 * Search and suggestions over the household's whole library index, read with no upstream call:
 * every result plays, through the person's own account or Auralis's, and says whether it is in
 * their own library. A search is kept among the
 * person's recent searches once its results are ready, unless they asked by HEAD; a suggestion
 * keeps nothing. A search is kept even when its client has left: one that leaves right after
 * asking has its answer written before Node reads the close, and a written answer looks delivered
 * whether or not anyone reads it, so the server cannot tell it from one that read its results.
 */
import { getSearch, getSearchSuggest, mediaRefKey, type SearchKind } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { personalView } from '../library/personal.js';
import { clientGone, serve } from '../route.js';
import { librarySource } from '../search/library.js';
import { rank, type SearchSource } from '../search/sources.js';
import { suggest } from '../search/suggest.js';
import type { Db } from '../store/connection.js';
import { recordSearch } from '../store/recentSearches.js';
import { signedIn } from './auth.js';

/** The kinds that name someone or a series, not an item. */
const NAME_KINDS: readonly SearchKind[] = ['artist', 'author', 'series'];

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
}
