/**
 * The signed-in person's lists: listening lists of books and shows, podcast playlists of
 * episodes, and digests over shows. Each answer reads the person's own Audiobookshelf
 * `GET /api/me`, once, for the libraries they may open and what they finished, and their played
 * marks from the store, and shows each list by its rules (lists/rules.ts). Every change is
 * checked whole before any of it is written, and written in one transaction:
 *
 * - The Digest keeps its name and its shows, and stays: 400 `fixed_list`; its order may change.
 * - A playlist takes episodes, a listening list books and shows, a digest shows; only a digest
 *   has an order or shows, and its entries are its rule's, never added: 400 `wrong_kind`.
 * - An entry not indexed, or in a library the person may not open, is 404, as is a list not theirs.
 * - An entry named twice is kept once, where first named; adding one already on a list keeps it
 *   where it is.
 */
import {
  addListItem,
  createList,
  deleteList,
  getList,
  type ListDetail,
  type ListItem,
  type ListKind,
  listLists,
  type MediaRef,
  mediaRefKey,
  setListItems,
  updateList,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { digestEpisodes, isPlayed, showFinished, subscribedShows } from '../lists/rules.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { Refusal, serve } from '../route.js';
import type { Db } from '../store/connection.js';
import * as store from '../store/lists.js';
import { upstreamFor } from '../upstream/links.js';
import { artUrl } from './art.js';
import { signedIn } from './auth.js';
import { type AbsAccess, absAccess, entry, type Standing } from './library.js';
import { refusalFor, type UpstreamAccess } from './play.js';

/** What each kind of list takes as an entry, by the index's kind. */
const TAKES: Record<ListKind, readonly string[]> = {
  playlist: ['episode'],
  listening: ['book', 'show'],
  digest: ['show'],
};

const NOT_STARTED: Standing = { progress: null, finished: false, updatedAt: null };
const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const notFound = () => new Refusal(404, 'not_found');
const wrongKind = () => new Refusal(400, 'wrong_kind');
const fixedList = () => new Refusal(400, 'fixed_list');

/** One answer's view of the person: who, what they may open and finished, and their marks. */
interface Reader {
  userId: string;
  access: AbsAccess | null;
  marks: Map<string, number>;
  now: number;
}

/** Each ref once, where first named. */
function once(refs: readonly MediaRef[]): MediaRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = mediaRefKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function listRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null; now: () => number },
): void {
  const { db, upstreams, now } = options;

  const readerFor = async (request: FastifyRequest): Promise<Reader> => {
    const user = signedIn(request);
    const abs = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user).abs;
    let access: AbsAccess | null = null;
    if (abs !== null) {
      try {
        access = await absAccess(abs);
      } catch (error) {
        if (error instanceof Refusal) throw error;
        refusalFor(error);
      }
    }
    return { userId: user.id, access, marks: store.playedMarks(db, user.id), now: now() };
  };

  const standing = (r: Reader, id: string) => r.access?.standing(id) ?? NOT_STARTED;
  const played = (r: Reader, row: StoredRow) =>
    isPlayed(standing(r, row.id), r.marks.get(mediaRefKey({ source: row.source, id: row.id })));

  /** The show an episode is of, or the row itself; undefined for an episode with no show. */
  const holder = (row: StoredRow) =>
    row.kind === 'episode'
      ? row.parentId === null
        ? undefined
        : indexedRow(db, row.source, row.parentId)
      : row;
  const opens = (r: Reader, row: StoredRow) => {
    const top = holder(row);
    return (
      top !== undefined && row.source === 'abs' && r.access !== null && r.access.open(top.libraryId)
    );
  };

  /** The indexed rows `refs` name that the person may open, in order. */
  const reachable = (r: Reader, refs: readonly MediaRef[]) =>
    refs
      .map((ref) => indexedRow(db, ref.source, ref.id))
      .filter((row): row is StoredRow => row !== undefined && opens(r, row));

  /** `refs` once each, each one `kind` takes, indexed and in a library the person may open. */
  const checked = (r: Reader, kind: ListKind, refs: readonly MediaRef[]): MediaRef[] => {
    const unique = once(refs);
    for (const ref of unique) {
      const row = indexedRow(db, ref.source, ref.id);
      if (row === undefined) throw notFound();
      if (!TAKES[kind].includes(row.kind)) throw wrongKind();
      if (!opens(r, row)) throw notFound();
    }
    return unique;
  };

  const episodeItem = (r: Reader, row: StoredRow): ListItem => {
    const show = holder(row)!;
    const showRef: MediaRef = { source: show.source, id: show.id };
    const { progress, finished } = standing(r, row.id);
    return {
      ref: { source: row.source, id: row.id },
      kind: 'episode',
      title: row.title,
      sub: show.title,
      art: show.hasArt ? artUrl(showRef) : null,
      publishedAt: row.publishedAt,
      duration: row.duration,
      progress,
      finished,
    };
  };

  const listeningItem = (r: Reader, row: StoredRow): ListItem => {
    if (row.kind === 'book') {
      const { progress, finished } = standing(r, row.id);
      const { ref, title, sub, art } = entry(row, 'book', progress);
      return {
        ref,
        kind: 'book',
        title,
        sub,
        art,
        publishedAt: null,
        duration: row.duration,
        progress,
        finished,
      };
    }
    const { ref, title, sub, art } = entry(row, 'show', null);
    return {
      ref,
      kind: 'show',
      title,
      sub,
      art,
      publishedAt: null,
      duration: null,
      progress: null,
      finished: showFinished(db, row, r.access),
    };
  };

  /** A list as it stands now, by its rules. */
  const shown = (r: Reader, list: store.StoredList): ListDetail => {
    let shows: StoredRow[] = [];
    let items: ListItem[];
    if (list.kind === 'digest') {
      shows = list.theDigest
        ? subscribedShows(db, r.access).sort((a, b) => byTitle.compare(a.title, b.title))
        : reachable(r, list.items).filter((row) => row.kind === 'show');
      items = digestEpisodes(db, shows, list.order ?? 'oldest', r.now, (row) => played(r, row)).map(
        (row) => episodeItem(r, row),
      );
    } else {
      const rows = reachable(r, list.items).filter((row) => TAKES[list.kind].includes(row.kind));
      items =
        list.kind === 'playlist'
          ? rows.filter((row) => !played(r, row)).map((row) => episodeItem(r, row))
          : rows.map((row) => listeningItem(r, row));
    }
    return {
      id: list.id,
      kind: list.kind,
      name: list.name,
      theDigest: list.theDigest,
      order: list.order,
      count: items.length,
      shows: shows.map((row) => entry(row, 'show', null)),
      items,
    };
  };

  /** One of the person's lists, or 404. */
  const owned = (r: Reader, id: string): store.StoredList => {
    const list = store.getList(db, r.userId, id);
    if (list === null) throw notFound();
    return list;
  };

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
    const r = await readerFor(request);
    store.ensureTheDigest(db, r.userId, r.now);
    return {
      lists: store.listLists(db, r.userId).map((list) => {
        const { shows: _shows, items: _items, ...summary } = shown(r, list);
        return summary;
      }),
    };
  });

  serve(app, getList, async (request, _reply, _body, { params }) => {
    const r = await readerFor(request);
    return shown(r, owned(r, params.id));
  });

  serve(app, createList, async (request, _reply, body) => {
    const r = await readerFor(request);
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
    const r = await readerFor(request);
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
        if (Object.keys(change).length > 0)
          now = store.updateList(db, r.userId, list.id, change, r.now);
        if (now !== null && shows !== undefined) {
          now = store.setListItems(db, r.userId, list.id, shows, r.now);
        }
        return now;
      })(),
    );
    return shown(r, updated);
  });

  serve(app, deleteList, async (request, _reply, _body, { params }) => {
    const r = await readerFor(request);
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
    const r = await readerFor(request);
    const list = entriesOf(r, params.id);
    const [ref] = checked(r, list.kind, [body.ref]);
    const key = mediaRefKey(ref!);
    if (list.items.some((item) => mediaRefKey(item) === key)) return shown(r, list);
    return shown(
      r,
      written(() => store.addListItem(db, r.userId, list.id, ref!, r.now)),
    );
  });

  serve(app, setListItems, async (request, _reply, body, { params }) => {
    const r = await readerFor(request);
    const list = entriesOf(r, params.id);
    const refs = checked(r, list.kind, body.refs);
    return shown(
      r,
      written(() => store.setListItems(db, r.userId, list.id, refs, r.now)),
    );
  });
}
