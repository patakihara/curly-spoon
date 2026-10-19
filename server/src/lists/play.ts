/**
 * What playing a listening list or a playlist plays: its unplayed entries in its order, from the
 * one asked for onwards, as one item for the spoken queue. A book enters as its chapters (read
 * beforehand, as for any play), a show as its unplayed episodes in the show's own order, and an
 * episode as itself. A finished book, a show with nothing left, and a played episode are left out.
 * The first entry's own playing-from stays; a list is not one, as `PlayingFrom` names an item.
 */
import { type MediaRef, mediaRefKey } from '@auralis/schema';
import { episodesInOrder, type StoredRow } from '../libraryIndex/store.js';
import type { Expansion } from '../queues/engine.js';
import { Refusal } from '../route.js';
import type * as store from '../store/lists.js';
import { notFound, played, type Reader, reachable, TAKES } from './reader.js';

export const nothingToPlay = () => new Refusal(400, 'nothing_to_play');

const refOf = (row: StoredRow): MediaRef => ({ source: row.source, id: row.id });

/** The episodes, books and shows of `list` that have something left to play, in its order. */
function playable(r: Reader, list: store.StoredList): StoredRow[] {
  return reachable(r, list.items)
    .filter((row) => TAKES[list.kind].includes(row.kind))
    .filter((row) =>
      row.kind === 'show'
        ? episodesInOrder(r.db, row.id).some((e) => !played(r, e))
        : !played(r, row),
    );
}

/**
 * The entries `list` plays from `start` (one of its entries with something left; else its
 * first) onwards: 404 for a `start` not among them, 400 `nothing_to_play` when nothing is left.
 */
export function listPlay(
  r: Reader,
  list: store.StoredList,
  start: MediaRef | undefined,
  expand: (ref: MediaRef) => Expansion | null,
): Expansion {
  const rows = playable(r, list);
  const from =
    start === undefined
      ? 0
      : rows.findIndex((row) => mediaRefKey(refOf(row)) === mediaRefKey(start));
  if (from === -1) throw notFound();
  const parts = rows.slice(from).flatMap((row) => {
    const refs =
      row.kind === 'show'
        ? episodesInOrder(r.db, row.id)
            .filter((e) => !played(r, e))
            .map(refOf)
        : [refOf(row)];
    return refs.flatMap((ref) => expand(ref) ?? []);
  });
  const [first] = parts;
  if (first === undefined) throw nothingToPlay();
  return { kind: first.kind, entries: parts.flatMap((p) => p.entries), from: first.from };
}
