/**
 * Browse's Up next and second-most-recent shelves, worked out from what the person listened to.
 *
 * What you listened to is the union of two histories: your own spoken plays in Auralis on every
 * one of your devices (never music, and never a play made in a digest's queue), and the books and
 * episodes in progress on Audiobookshelf, so listening in its own app counts too. Progress on an
 * episode whose newest Auralis play was a digest's is left out: the digest made it, not you. Each
 * book or episode was heard at the newer of its own play and Audiobookshelf's last change to it.
 *
 * Each book, and each show by its newest episode heard, is ranked by when it was last heard.
 * Only what the index holds, in a library the person may open, is kept, so every card is owned.
 * A book's card is the book while it is unfinished, else the first unfinished later book of its
 * series. A show's card is its newest episode heard while that is unplayed (it resumes), else
 * the first unplayed episode after it in the show's order. Played is finished on Audiobookshelf
 * or marked played by Auralis, as for a list, so a digest's finish is skipped too. Up next holds
 * each card once, newest first, at most `UP_NEXT_MAX`; the second shelf holds the cards of your
 * second most recent book and of your second most recent show. An empty shelf is left out.
 */
import { type MediaRef, mediaRefKey, UP_NEXT_MAX } from '@auralis/schema';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { opens, played, type Reader } from '../lists/reader.js';
import { isOwnPlay } from '../queues/autoplay.js';
import { episodeAfter, laterInSeries } from '../queues/next.js';
import { artUrl } from '../routes/art.js';
import { entry } from '../routes/library.js';
import type { UserPlay } from '../store/listening.js';

/** One card on a Browse shelf: a book or an episode to play next. */
export interface FeedCard {
  ref: MediaRef;
  kind: 'book' | 'episode';
  title: string;
  /** A book's authors, or an episode's show. */
  sub: string | null;
  /** A book's art, or an episode's show's. */
  art: string | null;
  progress: number | null;
  availability: { kind: 'owned' };
}

/** The shelves the composer fills, in the order Browse draws them. */
export type FeedShelfId = 'up-next' | 'second-recent';

export interface FeedShelf {
  id: FeedShelfId;
  items: FeedCard[];
}

/** A book, or a show by the newest of its episodes heard, and when it was last heard. */
interface Heard {
  kind: 'book' | 'show';
  /** The book, or the show's newest episode heard. */
  row: StoredRow;
  at: number;
}

/** Newest first: by when played, then by device, then the device's newest play first. */
const newestFirst = (a: UserPlay, b: UserPlay) =>
  b.playedAt - a.playedAt ||
  (a.deviceId < b.deviceId ? -1 : a.deviceId > b.deviceId ? 1 : 0) ||
  b.seq - a.seq;

/** Each book and episode heard, with when it was last heard, newest first. */
function heardItems(r: Reader, plays: readonly UserPlay[]): { ref: MediaRef; at: number }[] {
  const spoken = [...plays].filter((p) => p.queue === 'spoken').sort(newestFirst);
  const newest = new Map<string, UserPlay>();
  const heard = new Map<string, { ref: MediaRef; at: number }>();
  for (const p of spoken) {
    const key = mediaRefKey(p.ref);
    if (!newest.has(key)) newest.set(key, p);
    if (isOwnPlay(p) && !heard.has(key)) heard.set(key, { ref: p.ref, at: p.playedAt });
  }
  for (const s of r.access?.started ?? []) {
    const ref: MediaRef = { source: 'abs', id: s.id };
    const key = mediaRefKey(ref);
    const last = newest.get(key);
    if (last !== undefined && !isOwnPlay(last)) continue;
    const at = Math.max(heard.get(key)?.at ?? -Infinity, s.updatedAt ?? 0);
    heard.set(key, { ref, at });
  }
  return [...heard.values()].sort((a, b) => b.at - a.at);
}

/** The books and shows heard, each once, newest first, kept only where the person may open it. */
function ranked(r: Reader, plays: readonly UserPlay[]): Heard[] {
  const seen = new Set<string>();
  const out: Heard[] = [];
  for (const { ref, at } of heardItems(r, plays)) {
    const row = indexedRow(r.db, ref.source, ref.id);
    if (row === undefined || (row.kind !== 'book' && row.kind !== 'episode') || !opens(r, row)) {
      continue;
    }
    const holder = row.kind === 'book' ? row.id : row.parentId!;
    if (seen.has(holder)) continue;
    seen.add(holder);
    out.push({ kind: row.kind === 'book' ? 'book' : 'show', row, at });
  }
  return out;
}

const done = (r: Reader) => (row: StoredRow) => played(r, row) || !opens(r, row);

/** What plays next for a book or show heard: the row itself while unplayed, else what follows. */
async function nextOf(r: Reader, heard: Heard): Promise<StoredRow | null> {
  if (!done(r)(heard.row)) return heard.row;
  return heard.kind === 'book'
    ? laterInSeries(r.db, heard.row, done(r))
    : episodeAfter(r.db, heard.row, done(r));
}

function cardOf(r: Reader, row: StoredRow): FeedCard {
  const ref: MediaRef = { source: row.source, id: row.id };
  const progress = r.access?.standing(row.id).progress ?? null;
  const owned = { kind: 'owned' } as const;
  if (row.kind === 'book') {
    const { title, sub, art } = entry(row, 'book', progress);
    return { ref, kind: 'book', title, sub, art, progress, availability: owned };
  }
  const show = indexedRow(r.db, row.source, row.parentId!)!;
  const showRef: MediaRef = { source: show.source, id: show.id };
  return {
    ref,
    kind: 'episode',
    title: row.title,
    sub: show.title,
    art: show.hasArt ? artUrl(showRef) : null,
    progress,
    availability: owned,
  };
}

/** Browse's shelves for the person, from their plays across devices (`userPlays`). */
export async function composeFeed(r: Reader, plays: readonly UserPlay[]): Promise<FeedShelf[]> {
  if (r.access === null) return [];
  const heard = ranked(r, plays);
  const card = async (h: Heard) => {
    const next = await nextOf(r, h);
    return next === null ? null : cardOf(r, next);
  };

  const upNext: FeedCard[] = [];
  const shown = new Set<string>();
  for (const h of heard) {
    if (upNext.length === UP_NEXT_MAX) break;
    const c = await card(h);
    if (c === null || shown.has(mediaRefKey(c.ref))) continue;
    shown.add(mediaRefKey(c.ref));
    upNext.push(c);
  }

  const second = (kind: Heard['kind']) => heard.filter((h) => h.kind === kind)[1];
  const seconds = [second('book'), second('show')]
    .filter((h): h is Heard => h !== undefined)
    .sort((a, b) => b.at - a.at);
  const secondRecent: FeedCard[] = [];
  for (const h of seconds) {
    const c = await card(h);
    if (c !== null) secondRecent.push(c);
  }

  const shelves: FeedShelf[] = [
    { id: 'up-next', items: upNext },
    { id: 'second-recent', items: secondRecent },
  ];
  return shelves.filter((s) => s.items.length > 0);
}
