/**
 * A track's lyrics: one the index holds as a Jellyfin track, in a music library the signed-in
 * person's own Jellyfin shows them, checked once a minute per person and always before the cache
 * is read, so the cache never answers past access. Anything else answers 404. The lyrics come from
 * the household's cache when it holds a fresh answer, else from Jellyfin's file, read with the
 * person's own token, then LRCLIB, as `Lyrics.forTrack` resolves them for the track as the index
 * holds it now. An upstream failure answers 502, with nothing kept.
 */
import { getLyrics, type Lyrics as LyricsBody, parseMediaRefKey } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import type { Lyrics } from '../lyrics/service.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { upstreamFor } from '../upstream/links.js';
import { accessCache } from './accessCache.js';
import { signedIn } from './auth.js';
import { jellyfinViews } from './library.js';
import { refusalFor, type UpstreamAccess } from './play.js';

const notFound = () => new Refusal(404, 'not_found');

/** The indexed Jellyfin track `id` names, as the index holds it now; else 404. */
function indexedTrack(db: Db, id: string): StoredRow {
  const row = indexedRow(db, 'jellyfin', id);
  if (row?.kind !== 'track') throw notFound();
  return row;
}

export function lyricsRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null; lyrics: Lyrics },
): void {
  const { db, upstreams, lyrics } = options;
  const viewsAccess = accessCache();

  serve(app, getLyrics, async (request, _reply, _body, { params }): Promise<LyricsBody> => {
    const user = signedIn(request);
    const ref = parseMediaRefKey(params.ref);
    if (ref?.source !== 'jellyfin') throw notFound();
    const { libraryId } = indexedTrack(db, ref.id);
    const jellyfin = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user).jellyfin;
    if (jellyfin === null) throw notFound();
    const views = await viewsAccess(`${user.id}:jellyfin`, () => jellyfinViews(jellyfin)).catch(
      refusalFor,
    );
    if (libraryId === null || !views.has(libraryId)) throw notFound();
    // Read again after the wait: an answer is kept only for the track's current index version.
    const answer = await lyrics.forTrack(indexedTrack(db, ref.id), jellyfin).catch(refusalFor);
    return { ref, ...answer };
  });
}
