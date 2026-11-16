/**
 * One person's lists as they stand now, for every route that reads them: the lists routes, and
 * playing a list. A reader asks the person's own Audiobookshelf `GET /api/me` once, for the
 * libraries they may open and what they finished, adds what Auralis holds for them, and reads their
 * played marks; it also makes The Digest if they have none yet, so it exists wherever their lists
 * are read. With Auralis's own account set, every library opens, as it plays; without it, anything
 * in a library they may not open is left out, like what the index no longer holds, and named in a
 * change is 404 whatever its kind. A music list's songs are streamed songs search or an import
 * named, kept in `streamed_tracks`, and Jellyfin tracks in a library the person's own Jellyfin
 * shows (any, with Auralis's own Jellyfin account set); the person's Jellyfin is asked only when a
 * list of theirs, or a change, names a Jellyfin track.
 */
import {
  LIST_COVERS_MAX,
  LIST_ENTRIES_MAX,
  type ListDetail,
  type ListItem,
  type ListKind,
  type MediaRef,
  mediaRefKey,
} from '@auralis/schema';
import { AdapterError } from '../adapters/http/fetch.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { Refusal } from '../route.js';
import { artOf, artUrl } from '../routes/art.js';
import { entry } from '../routes/library.js';
import { refusalFor, type UpstreamAccess } from '../routes/play.js';
import { addPlayedClaims } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import * as store from '../store/lists.js';
import { streamedTrack } from '../store/streamedTracks.js';
import type { User } from '../store/users.js';
import { upstreamFor } from '../upstream/links.js';
import {
  type AbsAccess,
  absAccess,
  jellyfinViews,
  type Standing,
  withHeld,
} from '../upstream/reach.js';
import { digestEpisodes, isPlayed, showFinished, subscribedShows } from './rules.js';

/** What each kind of list takes as an entry, by the index's kind; a music list also takes streamed songs. */
export const TAKES: Record<ListKind, readonly string[]> = {
  playlist: ['episode'],
  listening: ['book', 'show'],
  digest: ['show'],
  music: ['track'],
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

/**
 * One answer's view of the person: who, what they may open and finished, their marks, and the
 * Jellyfin libraries they may open (`all` with Auralis's own account; null when not asked, or with
 * no link or a refused token; absent, not asked).
 */
export interface Reader {
  db: Db;
  userId: string;
  access: AbsAccess | null;
  marks: Map<string, store.PlayedMark>;
  views?: Set<string> | 'all' | null;
  now: number;
}

/** The Jellyfin libraries `user` may open, as `Reader.views` holds them. */
async function viewsOf(context: ListsContext, user: User): Promise<Set<string> | 'all' | null> {
  const { db, upstreams } = context;
  if (upstreams === null) return null;
  if ((upstreams.household?.jellyfin ?? null) !== null) return 'all';
  const jellyfin = upstreamFor({ db, ...upstreams }, user).jellyfin;
  if (jellyfin === null) return null;
  try {
    return await jellyfinViews(jellyfin);
  } catch (error) {
    if (error instanceof AdapterError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    refusalFor(error);
  }
}

const holdsJellyfin = (db: Db, userId: string): boolean =>
  db
    .prepare(
      `SELECT 1 FROM list_items i JOIN lists l ON l.id = i.list_id
       WHERE l.user_id = ? AND l.kind = 'music' AND i.source = 'jellyfin' LIMIT 1`,
    )
    .get(userId) !== undefined;

/**
 * A reader for `user`, now; their The Digest is made if they have none. `named`, the entries a
 * change names, asks their Jellyfin when one is a Jellyfin track.
 */
export async function readerFor(
  context: ListsContext,
  user: User,
  named: readonly MediaRef[] = [],
): Promise<Reader> {
  const { db, upstreams } = context;
  const abs = upstreams === null ? null : upstreamFor({ db, ...upstreams }, user).abs;
  let own: AbsAccess | null = null;
  if (abs !== null) {
    try {
      own = await absAccess(abs);
    } catch (error) {
      if (error instanceof Refusal) throw error;
      refusalFor(error);
    }
  }
  const now = context.now();
  if (own !== null) {
    // What they have begun is theirs, as the library lists find it.
    const begun = own.begun.map((id): MediaRef => ({ source: 'abs', id }));
    addPlayedClaims(db, user.id, begun, now);
  }
  store.ensureTheDigest(db, user.id, now);
  const access = withHeld(db, user.id, own, (upstreams?.household?.abs ?? null) !== null);
  const asksJellyfin = named.some((ref) => ref.source === 'jellyfin') || holdsJellyfin(db, user.id);
  const views = asksJellyfin ? await viewsOf(context, user) : null;
  return { db, userId: user.id, access, marks: store.playedMarks(db, user.id), views, now };
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

/** Whether the person may open an indexed row: it, or what holds it, is in their library. */
export function opens(r: Reader, row: StoredRow): boolean {
  if (row.source === 'jellyfin') {
    const top = row.parentId === null ? row : indexedRow(r.db, row.source, row.parentId);
    const library = (top ?? row).libraryId;
    const views = r.views ?? null;
    return views === 'all' || (views !== null && library !== null && views.has(library));
  }
  const top = holder(r, row);
  return (
    top !== undefined && row.source === 'abs' && r.access !== null && r.access.open(top.libraryId)
  );
}

/** One song of a music list: a streamed song, or a Jellyfin track the person may open. */
interface Song {
  ref: MediaRef;
  title: string;
  artists: string[];
  /** Seconds, where known. */
  duration: number | null;
}

/** The songs `refs` name that a music list plays and shows, in order. */
export function songs(r: Reader, refs: readonly MediaRef[]): Song[] {
  return refs.flatMap((ref): Song[] => {
    if (ref.source === 'ytmusic') {
      const t = streamedTrack(r.db, ref.id);
      return t === undefined
        ? []
        : [{ ref, title: t.title, artists: t.artists, duration: t.duration }];
    }
    const row = indexedRow(r.db, ref.source, ref.id);
    if (row === undefined || row.kind !== 'track' || !opens(r, row)) return [];
    const artists = row.creators.filter((c) => c.role === 'artist').map((c) => c.name);
    return [{ ref, title: row.title, artists, duration: row.duration }];
  });
}

function songItem(r: Reader, song: Song): ListItem {
  return {
    ref: song.ref,
    kind: 'song',
    title: song.title,
    sub: song.artists.length > 0 ? song.artists.join(', ') : null,
    art: artOf(r.db, song.ref),
    publishedAt: null,
    duration: song.duration,
    progress: null,
    finished: false,
  };
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
    if (ref.source === 'ytmusic') {
      if (streamedTrack(r.db, ref.id) === undefined) throw notFound();
      if (kind !== 'music') throw wrongKind();
      continue;
    }
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
    ? subscribedShows(r.db, r.userId)
        .filter((row) => opens(r, row))
        .sort((a, b) => byTitle.compare(a.title, b.title))
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
  } else if (list.kind === 'music') {
    items = songs(r, list.items).map((song) => songItem(r, song));
  } else {
    const rows = reachable(r, list.items).filter((row) => TAKES[list.kind].includes(row.kind));
    items =
      list.kind === 'playlist'
        ? rows.filter((row) => !played(r, row)).map((row) => episodeItem(r, row))
        : rows.map((row) => listeningItem(r, row));
  }
  const showEntries = shows.map((row) => entry(row, 'show', null));
  const counted = (kind: ListItem['kind']) => items.filter((item) => item.kind === kind).length;
  return {
    id: list.id,
    kind: list.kind,
    name: list.name,
    theDigest: list.theDigest,
    order: list.order,
    count: items.length,
    counts: { book: counted('book'), show: counted('show'), episode: counted('episode') },
    covers: [
      ...new Set((list.kind === 'digest' ? showEntries : items).flatMap((e) => e.art ?? [])),
    ].slice(0, LIST_COVERS_MAX),
    shows: showEntries,
    items,
  };
}

/** One of the person's lists, or 404. */
export function owned(r: Reader, id: string): store.StoredList {
  const list = store.getList(r.db, r.userId, id);
  if (list === null) throw notFound();
  return list;
}
