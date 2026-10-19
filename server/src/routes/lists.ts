/**
 * The signed-in person's lists: listening lists of books and shows, podcast playlists of
 * episodes, and digests over shows, each shown as it stands now (lists/reader.ts, by the rules in
 * lists/rules.ts). Every change is checked whole before any of it is written, and written in one
 * transaction:
 *
 * - The Digest keeps its name and its shows, and stays: 400 `fixed_list`; its order may change.
 * - An entry not indexed, or in a library the person may not open, is 404 whatever its kind, as
 *   is a list not theirs.
 * - A playlist takes episodes, a listening list books and shows, a digest shows; only a digest
 *   has an order or shows, and its entries are its rule's, never added: 400 `wrong_kind`.
 * - A list holds at most `LIST_ENTRIES_MAX` entries: 400 `list_full` past that.
 * - An entry named twice is kept once, where first named; adding one already on a list keeps it
 *   where it is.
 */
import {
  addListItem,
  createList,
  deleteList,
  getList,
  LIST_ENTRIES_MAX,
  listLists,
  mediaRefKey,
  setListItems,
  updateList,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  checked,
  fixedList,
  listFull,
  type ListsContext,
  notFound,
  owned,
  type Reader,
  readerFor,
  shown,
  wrongKind,
} from '../lists/reader.js';
import { serve } from '../route.js';
import * as store from '../store/lists.js';
import { signedIn } from './auth.js';

export function listRoutes(app: FastifyInstance, context: ListsContext): void {
  const { db } = context;
  const reader = (request: FastifyRequest) => readerFor(context, signedIn(request));

  /** A store write, its `FixedList` answered as a refusal, and a list gone since as 404. */
  const written = <T>(write: () => T | null): T => {
    try {
      const done = write();
      if (done === null) throw notFound();
      return done;
    } catch (error) {
      if (error instanceof store.FixedList) throw fixedList();
      throw error;
    }
  };

  serve(app, listLists, async (request) => {
    const r = await reader(request);
    return {
      lists: store.listLists(db, r.userId).map((list) => {
        const { shows: _shows, items: _items, ...summary } = shown(r, list);
        return summary;
      }),
    };
  });

  serve(app, getList, async (request, _reply, _body, { params }) => {
    const r = await reader(request);
    return shown(r, owned(r, params.id));
  });

  serve(app, createList, async (request, _reply, body) => {
    const r = await reader(request);
    if (body.kind !== 'digest' && (body.shows !== undefined || body.order !== undefined)) {
      throw wrongKind();
    }
    const shows = checked(r, 'digest', body.shows ?? []);
    const made = store.createList(
      db,
      r.userId,
      {
        kind: body.kind,
        name: body.name,
        items: shows,
        ...(body.order === undefined ? {} : { order: body.order }),
      },
      r.now,
    );
    return shown(r, made);
  });

  serve(app, updateList, async (request, _reply, body, { params }) => {
    const r = await reader(request);
    const list = owned(r, params.id);
    if (list.theDigest && (body.name !== undefined || body.shows !== undefined)) throw fixedList();
    if (list.kind !== 'digest' && (body.order !== undefined || body.shows !== undefined)) {
      throw wrongKind();
    }
    const shows = body.shows === undefined ? undefined : checked(r, 'digest', body.shows);
    const change = {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.order === undefined ? {} : { order: body.order }),
    };
    const updated = written(() =>
      db.transaction(() => {
        let now: store.StoredList | null = list;
        if (Object.keys(change).length > 0) {
          now = store.updateList(db, r.userId, list.id, change, r.now);
        }
        if (now !== null && shows !== undefined) {
          now = store.setListItems(db, r.userId, list.id, shows, r.now);
        }
        return now;
      })(),
    );
    return shown(r, updated);
  });

  serve(app, deleteList, async (request, _reply, _body, { params }) => {
    const r = await reader(request);
    const list = owned(r, params.id);
    if (list.theDigest) throw fixedList();
    written(() => (store.deleteList(db, r.userId, list.id, r.now) ? true : null));
    return { ok: true };
  });

  /** A listening list or playlist of the person's, whose entries may be changed. */
  const entriesOf = (r: Reader, id: string): store.StoredList => {
    const list = owned(r, id);
    if (list.theDigest) throw fixedList();
    if (list.kind === 'digest') throw wrongKind();
    return list;
  };

  serve(app, addListItem, async (request, _reply, body, { params }) => {
    const r = await reader(request);
    const list = entriesOf(r, params.id);
    const [ref] = checked(r, list.kind, [body.ref]);
    const key = mediaRefKey(ref!);
    if (list.items.some((item) => mediaRefKey(item) === key)) return shown(r, list);
    if (list.items.length >= LIST_ENTRIES_MAX) throw listFull();
    return shown(
      r,
      written(() => store.addListItem(db, r.userId, list.id, ref!, r.now)),
    );
  });

  serve(app, setListItems, async (request, _reply, body, { params }) => {
    const r = await reader(request);
    const list = entriesOf(r, params.id);
    const refs = checked(r, list.kind, body.refs);
    return shown(
      r,
      written(() => store.setListItems(db, r.userId, list.id, refs, r.now)),
    );
  });
}
