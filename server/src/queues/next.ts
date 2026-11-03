/**
 * What follows an item in the library: the next episode of its show, or the next book of its
 * series. Autoplay and Up next both ask here, each saying what counts as done for itself.
 *
 * `done` is asked about each candidate in order, and only until one is not done, so a caller can
 * put off reading an upstream until a candidate needs it.
 */
import { booksInSeries, episodesInOrder, type StoredRow } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';

/** Whether a candidate counts as done, so what follows skips it. */
export type Done = (row: StoredRow) => boolean | Promise<boolean>;

/**
 * The first episode after `episode` in its show's order (older to newer for serial shows, newer
 * to older for episodic and unknown ones) that is not done; null at the end of the show, or when
 * the index does not place it in a show. Never an earlier episode.
 */
export async function episodeAfter(
  db: Db,
  episode: StoredRow,
  done: Done,
): Promise<StoredRow | null> {
  if (episode.parentId === null) return null;
  const order = episodesInOrder(db, episode.parentId);
  const later = order.slice(order.findIndex((e) => e.id === episode.id) + 1 || order.length);
  for (const e of later) if (!(await done(e))) return e;
  return null;
}

/**
 * The first book after `book` in one of its series, in series order, that is not done; null when
 * none is left, or the book is in no series.
 */
export async function laterInSeries(
  db: Db,
  book: StoredRow,
  done: Done,
): Promise<StoredRow | null> {
  for (const series of book.series) {
    const books = booksInSeries(db, series.id);
    const at = books.findIndex((b) => b.id === book.id);
    if (at === -1) continue;
    for (const later of books.slice(at + 1)) if (!(await done(later))) return later;
  }
  return null;
}
