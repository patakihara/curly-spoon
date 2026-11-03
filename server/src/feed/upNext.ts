/**
 * Browse's Up next and second-most-recent shelves, worked out from what the person listened to.
 *
 * What you listened to is the union of two histories: your own spoken plays in Auralis on every
 * one of your devices (never music, and never a play made in a digest's queue), and the books and
 * episodes begun or finished on Audiobookshelf, so listening in its own app counts too. Progress
 * on an episode is left out when the digest made it, not you: while the episode is the current or
 * a queued entry of the digest's queue one of your devices plays now (not one put aside), or when
 * its newest Auralis play was a digest's, no more than `DIGEST_SYNC_MS` before Audiobookshelf last
 * changed it (a play is written once it stops being current, so the digest's sync can land after
 * it). Each book or episode was heard at the newer of its own play and Audiobookshelf's last
 * change to it. Whatever you removed from Audiobookshelf's Continue Listening is never a card,
 * and a series you removed from its Continue Series is never moved on in.
 *
 * Each book, and each show by its newest episode heard, is ranked by when it was last heard.
 * Only what the index holds, in a library the person may open, is kept, so every card is owned.
 * A book's card is the book while it is unfinished, else the first unfinished later book of its
 * series. A show's card is its newest episode heard while that is unplayed (it resumes), else
 * the first unplayed episode after it in the show's order. Played is finished on Audiobookshelf
 * or marked played by Auralis, as for a list, so a digest's finish is skipped too. Up next holds
 * each card once, newest first, at most `UP_NEXT_MAX`. The second shelf holds, for books and for
 * shows apart, the card of the most recent one after the newest whose card is there and differs
 * from the newest one's, so it never repeats the card Up next leads that kind with. An empty
 * shelf is left out.
 */
import {
  type FeedCard,
  type FeedShelf,
  type MediaRef,
  mediaRefKey,
  UP_NEXT_MAX,
} from '@auralis/schema';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { opens, played, type Reader } from '../lists/reader.js';
import { isOwnPlay } from '../queues/autoplay.js';
import { episodeAfter, laterInSeries } from '../queues/next.js';
import { artUrl } from '../routes/art.js';
import { entry } from '../routes/library.js';
import type { UserPlay } from '../store/listening.js';

/** How long after a digest's play Audiobookshelf's last change still counts as the digest's. */
export const DIGEST_SYNC_MS = 10 * 60 * 1000;

/** A second shelf's card, and when its book or show was heard. */
interface Second {
  card: FeedCard;
  at: number;
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

/**
 * Each book and episode heard, with when it was last heard, newest first. `inDigests` holds the
 * entries of the digest's queue each of the person's devices plays now.
 */
function heardItems(
  r: Reader,
  plays: readonly UserPlay[],
  inDigests: readonly MediaRef[],
): { ref: MediaRef; at: number }[] {
  const queued = new Set(inDigests.map(mediaRefKey));
  const spoken = [...plays].filter((p) => p.queue === 'spoken').sort(newestFirst);
  const newest = new Map<string, UserPlay>();
  const heard = new Map<string, { ref: MediaRef; at: number }>();
  for (const p of spoken) {
    const key = mediaRefKey(p.ref);
    if (!newest.has(key)) newest.set(key, p);
    if (isOwnPlay(p) && !heard.has(key)) heard.set(key, { ref: p.ref, at: p.playedAt });
  }
  for (const s of r.access?.heard ?? []) {
    const ref: MediaRef = { source: 'abs', id: s.id };
    const key = mediaRefKey(ref);
    const last = newest.get(key);
    if (queued.has(key)) continue;
    const lastUpdate = s.updatedAt ?? 0;
    if (last !== undefined && !isOwnPlay(last) && last.playedAt >= lastUpdate - DIGEST_SYNC_MS) {
      continue;
    }
    const at = Math.max(heard.get(key)?.at ?? -Infinity, s.updatedAt ?? 0);
    heard.set(key, { ref, at });
  }
  return [...heard.values()].sort((a, b) => b.at - a.at);
}

/**
 * The books and shows heard, each once, newest first, kept only where the person may open it.
 * Each is looked up in the index only as it is asked for.
 */
function* ranked(
  r: Reader,
  plays: readonly UserPlay[],
  inDigests: readonly MediaRef[],
): Generator<Heard> {
  const seen = new Set<string>();
  for (const { ref, at } of heardItems(r, plays, inDigests)) {
    const row = indexedRow(r.db, ref.source, ref.id);
    if (row === undefined || (row.kind !== 'book' && row.kind !== 'episode') || !opens(r, row)) {
      continue;
    }
    const holder = row.kind === 'book' ? row.id : row.parentId!;
    if (seen.has(holder)) continue;
    seen.add(holder);
    yield { kind: row.kind === 'book' ? 'book' : 'show', row, at };
  }
}

/** Whether a row is no card: played, in a library the person may not open, or hidden. */
const done = (r: Reader) => (row: StoredRow) =>
  played(r, row) || !opens(r, row) || r.access?.hidden(row.id) === true;

/** What plays next for a book or show heard: the row itself while unplayed, else what follows. */
async function nextOf(r: Reader, heard: Heard): Promise<StoredRow | null> {
  if (!done(r)(heard.row)) return heard.row;
  if (heard.kind === 'show') return episodeAfter(r.db, heard.row, done(r));
  const series = heard.row.series.filter((x) => r.access?.seriesHidden(x.id) !== true);
  return laterInSeries(r.db, { ...heard.row, series }, done(r));
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

/**
 * Browse's shelves for the person, from their plays across devices (`userPlays`) and the entries
 * of the digest's queue each of their devices plays now (`digestQueued`). Each book or show heard
 * has its card worked out once, newest first, until both shelves are full.
 */
export async function composeFeed(
  r: Reader,
  plays: readonly UserPlay[],
  inDigests: readonly MediaRef[] = [],
): Promise<FeedShelf[]> {
  if (r.access === null) return [];

  const upNext: FeedCard[] = [];
  const shown = new Set<string>();
  /**
   * Per kind, the card of the newest one heard (null when it has none), and the second shelf's:
   * the first card after it that differs from it, with when its book or show was heard.
   */
  const slots: Record<Heard['kind'], { lead?: FeedCard | null; second?: Second }> = {
    book: {},
    show: {},
  };
  for (const h of ranked(r, plays, inDigests)) {
    const next = await nextOf(r, h);
    const c = next === null ? null : cardOf(r, next);
    if (c !== null && upNext.length < UP_NEXT_MAX && !shown.has(mediaRefKey(c.ref))) {
      shown.add(mediaRefKey(c.ref));
      upNext.push(c);
    }
    const slot = slots[h.kind];
    if (slot.lead === undefined) slot.lead = c;
    else if (
      slot.second === undefined &&
      c !== null &&
      (slot.lead === null || mediaRefKey(c.ref) !== mediaRefKey(slot.lead.ref))
    ) {
      slot.second = { card: c, at: h.at };
    }
    const full = upNext.length === UP_NEXT_MAX;
    if (full && slots.book.second !== undefined && slots.show.second !== undefined) break;
  }

  const secondRecent = [slots.book.second, slots.show.second]
    .filter((x) => x !== undefined)
    .sort((a, b) => b.at - a.at)
    .map((x) => x.card);
  const shelves: FeedShelf[] = [
    { id: 'up-next', items: upNext },
    { id: 'second-recent', items: secondRecent },
  ];
  return shelves.filter((x) => x.items.length > 0);
}
