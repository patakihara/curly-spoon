/**
 * Autoplay: what a queue plays once it runs out, worked out ahead so a step never waits on an
 * upstream. `prepareAutoplay` works out each queue's pick from the item it would follow (its
 * current item, else its newest play) and keeps it on the session, with music's radio run and
 * when it ran; the engine's `autoplay` is `storedAutoplay`, which only reads them. It runs after
 * every change to a session, when a play starts, and after a progress report once the last run
 * is over `AUTOPLAY_STALE_MS` old, so a pick is never more than about two minutes stale.
 *
 * The play a queue follows is its current item, else its newest play of your own: one played in
 * a digest's queue never moves your place (`ownPlays`).
 *
 * Spoken: the next chapter of the book, then the first unfinished book after it in its series;
 * for an episode, the first episode after it in its show's order (older to newer for serial
 * shows, newer to older for episodic and unknown ones) that is neither finished nor played in
 * this session; nothing when none is left after it. Finished means finished on Audiobookshelf,
 * read as the user.
 *
 * Music: the rest of the album the queue plays from, by disc and position, then radio from music
 * you own: Jellyfin's Instant Mix for the last track, read as the user, skipping tracks that have
 * played. The run is kept and played on until every track of it has played, then asked for again
 * for the track that played last.
 *
 * An upstream that fails or times out leaves the queue with no pick for this step, logged; the
 * next pass asks again.
 *
 * A digest's queue autoplays nothing: it already holds all of the digest's episodes, so when it
 * runs out it stops, with nothing to wait for.
 */
import type { MediaRef, QueueType } from '@auralis/schema';
import type { AbsMe } from '../adapters/audiobookshelf/schemas.js';
import { INSTANT_MIX_LIMIT } from '../adapters/jellyfin/client.js';
import type { IndexItem } from '../adapters/jellyfin/schemas.js';
import {
  albumTracks,
  booksInSeries,
  episodesInOrder,
  indexedRow,
  type StoredRow,
} from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import type { QueueEntry, SessionPlay, SessionValue } from '../store/listening.js';
import type { Expansion } from './engine.js';

export interface AutoplayDeps {
  /** The library index. */
  db: Db;
  /** The engine's index lookup, for a book's chapters. */
  expand(ref: MediaRef): Expansion | null;
  /** Audiobookshelf as the user, for what they have finished. */
  abs: { getMe(): Promise<AbsMe> };
  /** Jellyfin as the user, for Instant Mix from their library. */
  jellyfin: { getInstantMix(itemId: string, limit: number): Promise<IndexItem[]> };
  log: { warn(detail: object, message: string): void };
  now(): number;
}

/** How old the last autoplay run may get before a progress report runs it again. */
export const AUTOPLAY_STALE_MS = 2 * 60_000;

/** True when autoplay has never run for the session, or last ran over two minutes before `now`. */
export function autoplayStale(session: SessionValue, now: number): boolean {
  return session.autoplayAt === null || now - session.autoplayAt > AUTOPLAY_STALE_MS;
}

const QUEUES: readonly QueueType[] = ['music', 'spoken'];

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;

const entryOf = (item: QueueEntry): QueueEntry => ({
  ref: item.ref,
  ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
});

const sameEntry = (a: QueueEntry, b: QueueEntry) =>
  key(a.ref) === key(b.ref) && (a.chapter ?? null) === (b.chapter ?? null);

/** Whether `queue` is a digest's, which autoplays nothing. */
const inDigest = (queue: QueueType, s: SessionValue): boolean =>
  queue === 'spoken' && s.spokenDigest !== null;

/**
 * The session's plays that are your own, in history order: every play but those in a digest's
 * queue. A digest marks what it plays played, but never moves your place in a show; Up next and
 * autoplay find that place here.
 */
export const ownPlays = (s: SessionValue): SessionPlay[] =>
  s.history.filter((h) => h.list === undefined);

/** The newest of your own plays on `queue`. */
const newestPlay = (s: SessionValue, queue: QueueType): SessionPlay | undefined =>
  ownPlays(s).reduce<SessionPlay | undefined>(
    (newest, h) => (h.queue === queue && (newest === undefined || h.seq > newest.seq) ? h : newest),
    undefined,
  );

/**
 * The entry autoplay on `queue` follows: its current item, else its newest play. Null when the
 * queue still has entries after it, so it cannot run out yet, or when it has never played.
 */
function followed(s: SessionValue, queue: QueueType): QueueEntry | null {
  const q = s.queues[queue];
  if (q.user.length > 0 || (q.context?.items.length ?? 0) > 0) return null;
  const item = q.current ?? newestPlay(s, queue);
  return item === undefined || item === null ? null : entryOf(item);
}

/**
 * Works out each queue's autoplay pick and keeps it on the session, with music's radio run and
 * when it ran.
 */
export async function prepareAutoplay(
  session: SessionValue,
  deps: AutoplayDeps,
): Promise<SessionValue> {
  const s = structuredClone(session);
  // Always worked out afresh, even for the same item: another device may have finished an
  // episode or book since. Both queues read their upstreams at once, so a hang costs one timeout.
  await Promise.all(
    QUEUES.map(async (queue) => {
      const after = inDigest(queue, s) ? null : followed(s, queue);
      if (after === null) {
        s.autoplay[queue] = null;
        return;
      }
      try {
        const next =
          queue === 'music' ? await musicPick(s, after, deps) : await spokenPick(s, after, deps);
        s.autoplay[queue] = { after, next };
      } catch (err) {
        deps.log.warn({ err, queue }, `autoplay has nothing for the ${queue} queue this time`);
        s.autoplay[queue] = null;
      }
    }),
  );
  s.autoplayAt = deps.now();
  return s;
}

/**
 * The engine's autoplay: the pick kept for `queue`, when it was worked out for the play that just
 * ended there (its newest). Never reads an upstream.
 */
export function storedAutoplay(queue: QueueType, session: SessionValue): QueueEntry | null {
  if (inDigest(queue, session)) return null;
  return autoplayKept(queue, session) ? session.autoplay[queue]!.next : null;
}

/**
 * True when the session keeps a pick for `queue` worked out for the play that just ended there
 * (its newest), even one saying nothing follows, or `queue` is a digest's, which autoplays
 * nothing; false when that pick is yet to be worked out.
 */
export function autoplayKept(queue: QueueType, session: SessionValue): boolean {
  if (inDigest(queue, session)) return true;
  const pick = session.autoplay[queue];
  const last = newestPlay(session, queue);
  return pick !== null && last !== undefined && sameEntry(pick.after, entryOf(last));
}

/**
 * What plays once `queue` runs out, as the session keeps it: the pick worked out for the entry the
 * queue follows now; null when it keeps none for that entry, or nothing follows it. Never reads an
 * upstream.
 */
export function pendingAutoplay(queue: QueueType, session: SessionValue): QueueEntry | null {
  if (inDigest(queue, session)) return null;
  const pick = session.autoplay[queue];
  const after = followed(session, queue);
  return pick !== null && after !== null && sameEntry(pick.after, after) ? pick.next : null;
}

/** What the user has finished on Audiobookshelf: books by id, episodes by show and episode id. */
async function finishedSet(deps: AutoplayDeps): Promise<Set<string>> {
  const me = await deps.abs.getMe();
  return new Set(
    me.mediaProgress
      .filter((p) => p.isFinished)
      .map((p) => (p.episodeId == null ? p.libraryItemId : `${p.libraryItemId}/${p.episodeId}`)),
  );
}

async function spokenPick(
  s: SessionValue,
  after: QueueEntry,
  deps: AutoplayDeps,
): Promise<QueueEntry | null> {
  const row = indexedRow(deps.db, after.ref.source, after.ref.id);
  if (row?.kind === 'episode') return nextEpisode(s, row, deps);

  const chapters = deps.expand(after.ref)?.entries ?? [];
  const at = chapters.findIndex((e) => sameEntry(e, after));
  const chapter = at === -1 ? undefined : chapters[at + 1];
  if (chapter !== undefined) return entryOf(chapter);
  return row?.kind === 'book' ? nextBook(row, deps) : null;
}

async function nextEpisode(
  s: SessionValue,
  episode: StoredRow,
  deps: AutoplayDeps,
): Promise<QueueEntry | null> {
  if (episode.parentId === null) return null;
  const show = episode.parentId;
  const order = episodesInOrder(deps.db, show);
  // Only episodes after this one in the show's own order; never jump back to an earlier one.
  const later = order.slice(order.findIndex((e) => e.id === episode.id) + 1 || order.length);
  if (later.length === 0) return null;
  // Played here counts as done, even before Audiobookshelf says it is finished.
  const played = new Set(s.history.map((h) => key(h.ref)));
  const finished = await finishedSet(deps);
  const next = later.find(
    (e) => !finished.has(`${show}/${e.id}`) && !played.has(key({ source: 'abs', id: e.id })),
  );
  return next === undefined ? null : { ref: { source: 'abs', id: next.id } };
}

async function nextBook(book: StoredRow, deps: AutoplayDeps): Promise<QueueEntry | null> {
  let finished: Set<string> | undefined;
  for (const series of book.series) {
    const books = booksInSeries(deps.db, series.id);
    const at = books.findIndex((b) => b.id === book.id);
    if (at === -1) continue;
    for (const later of books.slice(at + 1)) {
      finished ??= await finishedSet(deps);
      if (finished.has(later.id)) continue;
      const first = deps.expand({ source: later.source, id: later.id })?.entries[0];
      if (first !== undefined) return entryOf(first);
    }
  }
  return null;
}

/** The track after `after` on the album the music queue plays from, or null at its end. */
function albumRest(s: SessionValue, after: QueueEntry, deps: AutoplayDeps): QueueEntry | null {
  const from = s.queues.music.context?.from;
  if (from?.kind !== 'album' || from.ref.source !== 'jellyfin') return null;
  const tracks = albumTracks(deps.db, from.ref.id);
  const at = tracks.findIndex((t) => t.id === after.ref.id);
  const next = at === -1 ? undefined : tracks[at + 1];
  return next === undefined ? null : { ref: { source: 'jellyfin', id: next.id } };
}

async function musicPick(
  s: SessionValue,
  after: QueueEntry,
  deps: AutoplayDeps,
): Promise<QueueEntry | null> {
  const run = s.radio;
  const onRadio =
    run !== null &&
    (key(run.seed) === key(after.ref) || run.tracks.some((t) => key(t) === key(after.ref)));
  if (!onRadio) {
    const rest = albumRest(s, after, deps);
    if (rest !== null) return rest;
  }
  const played = new Set([key(after.ref), ...s.history.map((h) => key(h.ref))]);
  const left = onRadio ? run.tracks.find((t) => !played.has(key(t))) : undefined;
  if (left !== undefined) return { ref: left };
  if (after.ref.source !== 'jellyfin') return null;

  const mix = await deps.jellyfin.getInstantMix(after.ref.id, INSTANT_MIX_LIMIT);
  const tracks = mix.map((t): MediaRef => ({ source: 'jellyfin', id: t.Id }));
  const next = tracks.find((t) => !played.has(key(t)));
  // A run with nothing left to play is not kept, so the next pass asks Instant Mix again.
  s.radio = next === undefined ? null : { seed: after.ref, tracks };
  return next === undefined ? null : { ref: next };
}
