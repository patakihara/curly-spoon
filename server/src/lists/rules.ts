/**
 * What a list holds now, by its rules. A digest holds its shows' new, unplayed episodes: new is
 * published within the last `DIGEST_NEW_DAYS` days, and unplayed is neither finished on
 * Audiobookshelf nor marked played by Auralis since Audiobookshelf last changed it, so marking an
 * episode unplayed there brings it back; a mark Audiobookshelf never took holds regardless. An episode in progress stays in. A digest plays across
 * its shows by when each episode came out, oldest or newest first; episodes of one moment follow
 * show id, then the show's own order. The Digest's shows, until subscriptions arrive with
 * M3.podcasts, are every indexed show in an Audiobookshelf library the person may open.
 */
import type { DigestOrder } from '@auralis/schema';
import { episodesInOrder, type StoredRow, topLevelOfKind } from '../libraryIndex/store.js';
import type { Db } from '../store/connection.js';
import type { PlayedMark } from '../store/lists.js';
import type { AbsAccess, Standing } from '../routes/library.js';

/** How many days an episode stays new. */
export const DIGEST_NEW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether an episode published at `publishedAt` is new at `now`; an undated one never is. */
export function isNew(publishedAt: number | null, now: number): boolean {
  return publishedAt !== null && publishedAt <= now && publishedAt > now - DIGEST_NEW_DAYS * DAY_MS;
}

/**
 * Whether an episode counts as played: finished on Audiobookshelf, or marked played by Auralis
 * (`mark`) no earlier than Audiobookshelf last changed it, or with no change there at all. A mark
 * at the very moment of the change wins: only a later change there unmarks it. A mark
 * Audiobookshelf never took holds whatever it says later: a later change there, such as a play
 * session's close, cannot have meant to unmark what it never heard of.
 */
export function isPlayed(standing: Standing, mark: PlayedMark | undefined): boolean {
  if (standing.finished) return true;
  if (mark === undefined) return false;
  return !mark.confirmed || standing.updatedAt === null || mark.at >= standing.updatedAt;
}

/** The shows The Digest covers: every indexed Audiobookshelf show in a library the person may open. */
export function subscribedShows(db: Db, access: AbsAccess | null): StoredRow[] {
  if (access === null) return [];
  return topLevelOfKind(db, 'show').filter(
    (row) => row.source === 'abs' && access.open(row.libraryId),
  );
}

/**
 * A digest's episodes over `shows` at `now`, in its order, leaving out the played ones. Only the
 * dates turn round for newest first: episodes of one moment keep show id, then the show's order.
 */
export function digestEpisodes(
  db: Db,
  shows: readonly StoredRow[],
  order: DigestOrder,
  now: number,
  played: (episode: StoredRow) => boolean,
): StoredRow[] {
  const direction = order === 'newest' ? -1 : 1;
  return [...shows]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((show, s) =>
      episodesInOrder(db, show.id)
        .map((row, e) => ({ row, s, e }))
        .filter(({ row }) => isNew(row.publishedAt, now) && !played(row)),
    )
    .sort((a, b) => direction * (a.row.publishedAt! - b.row.publishedAt!) || a.s - b.s || a.e - b.e)
    .map(({ row }) => row);
}

/** Whether a show on a listening list is finished: it has episodes, and every one is finished. */
export function showFinished(db: Db, show: StoredRow, access: AbsAccess | null): boolean {
  const episodes = episodesInOrder(db, show.id);
  return (
    access !== null &&
    episodes.length > 0 &&
    episodes.every((row) => access.standing(row.id).finished)
  );
}
