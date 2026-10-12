/**
 * Autoplay: what a queue plays once it runs out, worked out ahead so a step never waits on an
 * upstream. After every change to a session, `prepareAutoplay` works out each queue's pick from
 * the item it would follow (its current item, else its newest play) and keeps it on the session,
 * with music's radio run; the engine's `autoplay` is `storedAutoplay`, which only reads them.
 *
 * Spoken: the next chapter of the book, then the first unfinished book after it in its series;
 * for an episode, the first unfinished episode of its show in the show's order (oldest first for
 * serial shows, newest first for episodic and unknown ones), other than the one it follows.
 * Finished means finished on Audiobookshelf, read as the user.
 *
 * Music: the rest of the album the queue plays from, by disc and position, then radio from music
 * you own: Jellyfin's Instant Mix for the last track, read as the user, skipping tracks that have
 * played. The run is kept and played on until every track of it has played, then asked for again
 * for the track that played last.
 *
 * An upstream that fails or times out leaves the queue with no pick for this step, logged; the
 * next pass asks again.
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
}

const QUEUES: readonly QueueType[] = ['music', 'spoken'];

const key = (ref: MediaRef) => `${ref.source}:${ref.id}`;

const entryOf = (item: QueueEntry): QueueEntry => ({
  ref: item.ref,
  ...(item.chapter === undefined ? {} : { chapter: item.chapter }),
});

const sameEntry = (a: QueueEntry, b: QueueEntry) =>
  key(a.ref) === key(b.ref) && (a.chapter ?? null) === (b.chapter ?? null);

const newestPlay = (s: SessionValue, queue: QueueType): SessionPlay | undefined =>
  s.history.reduce<SessionPlay | undefined>(
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
 * Works out each queue's autoplay pick and keeps it on the session, with music's radio run. A
 * pick already worked out for the same item is kept as it is, with nothing read.
 */
export async function prepareAutoplay(
  session: SessionValue,
  deps: AutoplayDeps,
): Promise<SessionValue> {
  const s = structuredClone(session);
  for (const queue of QUEUES) {
    const after = followed(s, queue);
    const kept = s.autoplay[queue];
    if (after === null) s.autoplay[queue] = null;
    else if (kept === null || !sameEntry(kept.after, after)) {
      try {
        const next =
          queue === 'music' ? await musicPick(s, after, deps) : await spokenPick(after, deps);
        s.autoplay[queue] = { after, next };
      } catch (err) {
        deps.log.warn({ err, queue }, `autoplay has nothing for the ${queue} queue this time`);
        s.autoplay[queue] = null;
      }
    }
  }
  return s;
}

/**
 * The engine's autoplay: the pick kept for `queue`, when it was worked out for the play that just
 * ended there (its newest). Never reads an upstream.
 */
export function storedAutoplay(queue: QueueType, session: SessionValue): QueueEntry | null {
  const pick = session.autoplay[queue];
  const last = newestPlay(session, queue);
  if (pick === null || last === undefined || !sameEntry(pick.after, entryOf(last))) return null;
  return pick.next;
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

async function spokenPick(after: QueueEntry, deps: AutoplayDeps): Promise<QueueEntry | null> {
  const row = indexedRow(deps.db, after.ref.source, after.ref.id);
  if (row?.kind === 'episode') return nextEpisode(row, deps);

  const chapters = deps.expand(after.ref)?.entries ?? [];
  const at = chapters.findIndex((e) => sameEntry(e, after));
  const chapter = at === -1 ? undefined : chapters[at + 1];
  if (chapter !== undefined) return entryOf(chapter);
  return row?.kind === 'book' ? nextBook(row, deps) : null;
}

async function nextEpisode(episode: StoredRow, deps: AutoplayDeps): Promise<QueueEntry | null> {
  if (episode.parentId === null) return null;
  const show = episode.parentId;
  const others = episodesInOrder(deps.db, show).filter((e) => e.id !== episode.id);
  if (others.length === 0) return null;
  const finished = await finishedSet(deps);
  const next = others.find((e) => !finished.has(`${show}/${e.id}`));
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
  s.radio = { seed: after.ref, tracks };
  const next = tracks.find((t) => !played.has(key(t)));
  return next === undefined ? null : { ref: next };
}
