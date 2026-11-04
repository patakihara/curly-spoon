/**
 * Bookmarks, kept on the item's own server as the signed-in person, with their own token: only
 * Audiobookshelf keeps them. ABS keeps a person's bookmarks per library item, lists them all on
 * `GET /api/me`, and deletes one by its item and time, answering 404 when none is there
 * (recorded). Jellyfin keeps none, so a Jellyfin ref is refused 400 `no_bookmarks`, asking
 * nothing.
 *
 * On an indexed book their own account does not reach, linked or not, the bookmark stays in Auralis
 * (`store/heldBookmarks.ts`) and every route answers as it does for Audiobookshelf. Nobody's account
 * hears of it. Once their own account reaches the book, the next route on it moves what is held
 * there, once, as held progress moves; one that fails to move stays held, and still lists.
 */
import {
  type Bookmark,
  createBookmark,
  deleteBookmark,
  listBookmarks,
  type MediaRef,
  parseMediaRefKey,
} from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import { type AbsBookmark } from '../adapters/audiobookshelf/schemas.js';
import { indexedRow } from '../libraryIndex/store.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import { dropHeldBookmark, heldBookmarks, keepBookmark } from '../store/heldBookmarks.js';
import type { User } from '../store/users.js';
import { Reach } from '../upstream/reach.js';
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
  options: { db: Db; upstreams: UpstreamAccess | null; now?: () => number },
): void {
  const { db, upstreams } = options;
  const reach = new Reach(db, upstreams);
  const now = options.now ?? Date.now;

  /** The caller's own Audiobookshelf client. */
  const ownAbs = (user: User): AbsClient => {
    const abs = reach.own(user).abs;
    if (abs === null) throw new Refusal(409, 'not_linked');
    return abs;
  };

  /**
   * Whose bookmarks these are to keep: their own account's, or null to keep them in Auralis, on an
   * indexed book that account does not reach. A failed check leaves it to their own account.
   */
  const keeperOf = async (user: User, itemId: string): Promise<AbsClient | null> => {
    const row = indexedRow(db, 'abs', itemId);
    if (row === undefined || reach.household('abs') === null) return ownAbs(user);
    try {
      if (!(await reach.reaches(user, row))) return null;
    } catch (err) {
      app.log.warn({ err }, 'could not check what the person’s own account reaches');
    }
    return ownAbs(user);
  };

  /** Moves what Auralis holds on the item to their own account, each once; a failure is logged. */
  const moveHeld = async (user: User, abs: AbsClient, itemId: string): Promise<void> => {
    const held = heldBookmarks(db, user.id, itemId);
    if (held.length === 0) return;
    try {
      const there = (await abs.getMe()).bookmarks.filter((b) => b.libraryItemId === itemId);
      for (const { time, title } of held) {
        if (!there.some((b) => b.time === time)) {
          await abs.createBookmark(itemId, { time, title });
        }
        dropHeldBookmark(db, user.id, itemId, time);
      }
    } catch (err) {
      app.log.warn({ err }, 'a bookmark Auralis holds could not move to the person’s own account');
    }
  };

  const heldAsBookmarks = (user: User, itemId: string): Bookmark[] =>
    heldBookmarks(db, user.id, itemId).map(({ time, title, createdAt }) => ({
      ref: { source: 'abs', id: itemId },
      time,
      title,
      createdAt,
    }));

  serve(app, listBookmarks, async (request, _reply, _body, { query }) => {
    const itemId = absItemOf(parseMediaRefKey(query.ref));
    const user = signedIn(request);
    const abs = await keeperOf(user, itemId);
    if (abs === null) return { bookmarks: heldAsBookmarks(user, itemId) };
    await moveHeld(user, abs, itemId);
    const me = await abs.getMe().catch(refusalFor);
    const bookmarks = [
      ...me.bookmarks.filter((b) => b.libraryItemId === itemId).map(asBookmark),
      ...heldAsBookmarks(user, itemId),
    ].sort((a, b) => a.time - b.time);
    return { bookmarks };
  });

  serve(app, createBookmark, async (request, _reply, body) => {
    const itemId = absItemOf(body.ref);
    const user = signedIn(request);
    const abs = await keeperOf(user, itemId);
    if (abs === null) {
      const createdAt = now();
      keepBookmark(db, user.id, itemId, { time: body.time, title: body.title, createdAt });
      return { ref: body.ref, time: body.time, title: body.title, createdAt };
    }
    await moveHeld(user, abs, itemId);
    const made = await abs
      .createBookmark(itemId, { time: body.time, title: body.title })
      .catch(refusalFor);
    return asBookmark(made);
  });

  serve(app, deleteBookmark, async (request, _reply, _body, { params }) => {
    const itemId = absItemOf(parseMediaRefKey(params.ref));
    const time = Number(params.time);
    const user = signedIn(request);
    const abs = await keeperOf(user, itemId);
    if (abs === null) {
      if (!dropHeldBookmark(db, user.id, itemId, time)) throw new Refusal(404, 'not_found');
      return { ok: true };
    }
    await moveHeld(user, abs, itemId);
    if (dropHeldBookmark(db, user.id, itemId, time)) return { ok: true };
    await abs.deleteBookmark(itemId, time).catch(refusalFor);
    return { ok: true };
  });
}
