/**
 * Bookmarks, kept on the item's own server as the signed-in person, with their own token: only
 * Audiobookshelf keeps them. ABS keeps a person's bookmarks per library item, lists them all on
 * `GET /api/me`, and deletes one by its item and time, answering 404 when none is there
 * (recorded). Jellyfin keeps none, so a Jellyfin ref is refused 400 `no_bookmarks`, asking
 * nothing.
 */
import {
  type Bookmark,
  createBookmark,
  deleteBookmark,
  listBookmarks,
  type MediaRef,
  parseMediaRefKey,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { type AbsBookmark } from '../adapters/audiobookshelf/schemas.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { upstreamFor } from '../upstream/links.js';
import { signedIn } from './auth.js';
import { refusalFor, type UpstreamAccess } from './play.js';

/** The Audiobookshelf item a ref names; a ref anywhere else keeps no bookmarks. */
function absItemOf(ref: MediaRef | null): string {
  if (ref === null) throw new Refusal(400, 'bad_request');
  if (ref.source !== 'abs') throw new Refusal(400, 'no_bookmarks');
  return ref.id;
}

const asBookmark = (b: AbsBookmark): Bookmark => ({
  ref: { source: 'abs', id: b.libraryItemId },
  time: b.time,
  title: b.title,
  createdAt: b.createdAt,
});

export function bookmarkRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null },
): void {
  const { db, upstreams } = options;

  /** The caller's own Audiobookshelf client. */
  const absFor = (request: FastifyRequest) => {
    const user = signedIn(request);
    const abs = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user).abs;
    if (abs === null) throw new Refusal(409, 'not_linked');
    return abs;
  };

  serve(app, listBookmarks, async (request, _reply, _body, { query }) => {
    const itemId = absItemOf(parseMediaRefKey(query.ref));
    const me = await absFor(request).getMe().catch(refusalFor);
    const bookmarks = me.bookmarks
      .filter((b) => b.libraryItemId === itemId)
      .sort((a, b) => a.time - b.time)
      .map(asBookmark);
    return { bookmarks };
  });

  serve(app, createBookmark, async (request, _reply, body) => {
    const itemId = absItemOf(body.ref);
    const made = await absFor(request)
      .createBookmark(itemId, { time: body.time, title: body.title })
      .catch(refusalFor);
    return asBookmark(made);
  });

  serve(app, deleteBookmark, async (request, _reply, _body, { params }) => {
    const itemId = absItemOf(parseMediaRefKey(params.ref));
    await absFor(request).deleteBookmark(itemId, Number(params.time)).catch(refusalFor);
    return { ok: true };
  });
}
