/**
 * What playing a listening list or a playlist plays: its unplayed entries in its order, from the
 * one asked for onwards, as one item for the spoken queue. A book enters as its chapters (read
 * beforehand, as for any play), a show as its unplayed episodes in the show's own order, and an
 * episode as itself. A finished book, a show with nothing left, and a played episode are left out,
 * unless it is the one asked for: that plays from its beginning, a show as all its episodes. A
 * list play plays from nothing, as `PlayingFrom` names an item, not a list.
 */
import { type MediaRef, mediaRefKey } from '@auralis/schema';
import { episodesInOrder, type StoredRow } from '../libraryIndex/store.js';
import type { Expansion } from '../queues/engine.js';
import { Refusal } from '../route.js';
import type * as store from '../store/lists.js';
import { notFound, played, type Reader, reachable, TAKES } from './reader.js';

export const nothingToPlay = () => new Refusal(400, 'nothing_to_play');

const refOf = (row: StoredRow): MediaRef => ({ source: row.source, id: row.id });

/** Whether a row has something left to play: a show an unplayed episode, else itself unplayed. */
const left = (r: Reader, row: StoredRow): boolean =>
  row.kind === 'show' ? episodesInOrder(r.db, row.id).some((e) => !played(r, e)) : !played(r, row);

/** What a list play plays, before it is expanded, and whether it starts over a finished entry. */
export interface ListRun {
  refs: MediaRef[];
  again: boolean;
}

/**
 * The refs `list` plays from `start` (one of its entries; else its first with something left)
 * onwards: 404 for a `start` not on it, 400 `nothing_to_play` when nothing is left.
 */
export function listRun(r: Reader, list: store.StoredList, start: MediaRef | undefined): ListRun {
  const rows = reachable(r, list.items).filter((row) => TAKES[list.kind].includes(row.kind));
  const from =
    start === undefined
      ? rows.findIndex((row) => left(r, row))
      : rows.findIndex((row) => mediaRefKey(refOf(row)) === mediaRefKey(start));
  if (start !== undefined && from === -1) throw notFound();
  if (from === -1) throw nothingToPlay();
  const first = rows[from]!;
  const again = !left(r, first);
  const refs = [first, ...rows.slice(from + 1).filter((row) => left(r, row))].flatMap((row) =>
    row.kind === 'show'
      ? episodesInOrder(r.db, row.id)
          .filter((e) => (again && row === first) || !played(r, e))
          .map(refOf)
      : [refOf(row)],
  );
  return { refs, again };
}

/** A run's refs as one item for the spoken queue, from no item. */
export function listExpansion(
  run: ListRun,
  expand: (ref: MediaRef) => Expansion | null,
): Expansion {
  const parts = run.refs.flatMap((ref) => expand(ref) ?? []);
  const [first] = parts;
  if (first === undefined) throw nothingToPlay();
  return { kind: first.kind, entries: parts.flatMap((p) => p.entries), from: null };
}
