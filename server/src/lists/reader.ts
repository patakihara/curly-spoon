/**
 * One person's lists as they stand now, for every route that reads them: the lists routes, and
 * playing a list. A reader asks the person's own Audiobookshelf `GET /api/me` once, for the
 * libraries they may open and what they finished, and reads their played marks; it also makes
 * The Digest if they have none yet, so it exists wherever their lists are read. Anything the
 * index no longer holds, or in a library they may not open, is left out of a list, and named
 * in a change is 404 whatever its kind: nobody learns what sits in a library they cannot open.
 */
import {
  LIST_ENTRIES_MAX,
  type ListDetail,
  type ListItem,
  type ListKind,
  type MediaRef,
  mediaRefKey,
} from '@auralis/schema';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { Refusal } from '../route.js';
import { artUrl } from '../routes/art.js';
import { type AbsAccess, absAccess, entry, type Standing } from '../routes/library.js';
import { refusalFor, type UpstreamAccess } from '../routes/play.js';
import type { Db } from '../store/connection.js';
import * as store from '../store/lists.js';
import type { User } from '../store/users.js';
import { upstreamFor } from '../upstream/links.js';
import { digestEpisodes, isPlayed, showFinished, subscribedShows } from './rules.js';

/** What each kind of list takes as an entry, by the index's kind. */
export const TAKES: Record<ListKind, readonly string[]> = {
  playlist: ['episode'],
  listening: ['book', 'show'],
  digest: ['show'],
};

const NOT_STARTED: Standing = { progress: null, finished: false, updatedAt: null };
const byTitle = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

export const notFound = () => new Refusal(404, 'not_found');
export const wrongKind = () => new Refusal(400, 'wrong_kind');
export const fixedList = () => new Refusal(400, 'fixed_list');
export const listFull = () => new Refusal(400, 'list_full');

/** Where lists are read from: the store, each person's upstreams, and the clock. */
export interface ListsContext {
  db: Db;
  upstreams: UpstreamAccess | null;
  now: () => number;
}

/** One answer's view of the person: who, what they may open and finished, and their marks. */
export interface Reader {
  db: Db;
  userId: string;
  access: AbsAccess | null;
  marks: Map<string, number>;
  now: number;
}

/** A reader for `user`, now; their The Digest is made if they have none. */
export async function readerFor(context: ListsContext, user: User): Promise<Reader> {
  const { db, upstreams } = context;
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
  const now = context.now();
  store.ensureTheDigest(db, user.id, now);
  return { db, userId: user.id, access, marks: store.playedMarks(db, user.id), now };
}

const standing = (r: Reader, id: string) => r.access?.standing(id) ?? NOT_STARTED;

/** Whether the person played an episode: finished it upstream, or Auralis marked it since. */
export const played = (r: Reader, row: StoredRow): boolean =>
  isPlayed(standing(r, row.id), r.marks.get(mediaRefKey({ source: row.source, id: row.id })));

/** The show an episode is of, or the row itself; undefined for an episode with no show. */
function holder(r: Reader, row: StoredRow): StoredRow | undefined {
  if (row.kind !== 'episode') return row;
  return row.parentId === null ? undefined : indexedRow(r.db, row.source, row.parentId);
}

/** Whether the person may open an indexed row: it, or an episode's show, is in their library. */
export function opens(r: Reader, row: StoredRow): boolean {
  const top = holder(r, row);
  return (
    top !== undefined && row.source === 'abs' && r.access !== null && r.access.open(top.libraryId)
  );
}

/** The indexed rows `refs` name that the person may open, in order. */
export const reachable = (r: Reader, refs: readonly MediaRef[]): StoredRow[] =>
  refs
    .map((ref) => indexedRow(r.db, ref.source, ref.id))
    .filter((row): row is StoredRow => row !== undefined && opens(r, row));

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

/**
 * `refs` once each, each indexed and in a library the person may open (else 404, whatever its
 * kind), and each one a `kind` list takes (else 400 `wrong_kind`).
 */
export function checked(r: Reader, kind: ListKind, refs: readonly MediaRef[]): MediaRef[] {
  const unique = once(refs);
  for (const ref of unique) {
    const row = indexedRow(r.db, ref.source, ref.id);
    if (row === undefined || !opens(r, row)) throw notFound();
    if (!TAKES[kind].includes(row.kind)) throw wrongKind();
  }
  if (unique.length > LIST_ENTRIES_MAX) throw listFull();
  return unique;
}

function episodeItem(r: Reader, row: StoredRow): ListItem {
  const show = holder(r, row)!;
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
}

function listeningItem(r: Reader, row: StoredRow): ListItem {
  if (row.kind === 'book') {
    const { progress, finished } = standing(r, row.id);
    const { ref, title, sub, art } = entry(row, 'book', progress);
    const book = { ref, kind: 'book', title, sub, art, publishedAt: null } as const;
    return { ...book, duration: row.duration, progress, finished };
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
    finished: showFinished(r.db, row, r.access),
  };
}

/** A digest's shows the person may open: every one for The Digest, by title; else its own. */
export function digestShows(r: Reader, list: store.StoredList): StoredRow[] {
  return list.theDigest
    ? subscribedShows(r.db, r.access).sort((a, b) => byTitle.compare(a.title, b.title))
    : reachable(r, list.items).filter((row) => row.kind === 'show');
}

/** A digest's episodes now, in its order: its shows' new ones the person has not played. */
export function digestRows(r: Reader, list: store.StoredList): StoredRow[] {
  return digestEpisodes(r.db, digestShows(r, list), list.order ?? 'oldest', r.now, (row) =>
    played(r, row),
  );
}

/** A list as it stands now, by its rules. */
export function shown(r: Reader, list: store.StoredList): ListDetail {
  let shows: StoredRow[] = [];
  let items: ListItem[];
  if (list.kind === 'digest') {
    shows = digestShows(r, list);
    items = digestRows(r, list).map((row) => episodeItem(r, row));
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
}

/** One of the person's lists, or 404. */
export function owned(r: Reader, id: string): store.StoredList {
  const list = store.getList(r.db, r.userId, id);
  if (list === null) throw notFound();
  return list;
}
