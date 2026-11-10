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
 * books can be requested, and the albums it lacks, from MusicBrainz, while albums can. It waits for
 * each source only up to its catalogue's limit, and whatever goes
 * wrong there the library's results still answer. It lists the songs the library lacks the same way,
 * from YouTube Music, each playing straight away, and saying so when a keep the person is on is
 * under way; a kept song is the library's own track. While streaming is unavailable it lists none and
 * says so, and asks nothing. The top songs are readied ahead of their tap, after the answer's rows
 * are known and without waiting on it.
 */
import {
  getSearch,
  getSearchSuggest,
  mediaRefKey,
  searchAlbumArt,
  searchBookArt,
  type SearchAlbum,
  type SearchSong,
  type SearchBook,
  type SearchKind,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { personalView } from '../library/personal.js';
import { songRows } from '../music/catalogue.js';
import type { Music } from '../music/index.js';
import { albumRows, type AlbumCatalogue } from '../requests/albums/catalogue.js';
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

/** How a book or album row's cover is cached: a day, by the person's own client only. */
const ART_CACHE = 'private, max-age=86400';

export function searchRoutes(
  app: FastifyInstance,
  options: {
    db: Db;
    now: () => number;
    catalogue?: BookCatalogue;
    albumCatalogue?: AlbumCatalogue;
    music?: Music | null;
  },
): void {
  const { db, now, catalogue, albumCatalogue } = options;
  const music = options.music ?? null;
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

  /** The rows for this search; none for a search of other kinds, or when anything goes wrong. */
  const albums = async (
    request: FastifyRequest,
    q: string,
    kinds: readonly SearchKind[] | undefined,
    userId: string,
    gone: AbortSignal,
  ): Promise<SearchAlbum[]> => {
    if (albumCatalogue === undefined || (kinds !== undefined && !kinds.includes('album'))) {
      return [];
    }
    try {
      const art = albumCatalogue.hasArt;
      return albumRows(db, userId, await albumCatalogue.search(q, gone), { art });
    } catch (err) {
      request.log.warn({ err }, 'no album rows');
      return [];
    }
  };

  /** The rows for this search; none for a search of other kinds, or when anything goes wrong. */
  const songs = async (
    request: FastifyRequest,
    q: string,
    kinds: readonly SearchKind[] | undefined,
    user: { id: string; deviceId: string },
    gone: AbortSignal,
  ): Promise<SearchSong[]> => {
    if (music === null || (kinds !== undefined && !kinds.includes('track'))) return [];
    try {
      const rows = songRows(db, user.id, await music.searchSongs(q, gone));
      music.resolveAhead(user.deviceId, rows);
      return rows;
    } catch (err) {
      request.log.warn({ err }, 'no song rows');
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
    const [lists, found, foundAlbums, streamed] = await Promise.all([
      Promise.all(sources.map((source) => source.search(asked, gone))),
      books(request, query.q, query.kinds, user.id, gone),
      albums(request, query.q, query.kinds, user.id, gone),
      songs(request, query.q, query.kinds, user, gone),
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
      albums: foundAlbums,
      songs: streamed,
      streaming:
        music === null || music.state.available ? ('ok' as const) : ('unavailable' as const),
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

  serveStream(app, searchAlbumArt, async (request, { params, signal }) => {
    signedIn(request);
    const art = await albumCatalogue?.art(params.mbid, signal);
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
