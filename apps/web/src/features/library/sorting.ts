/**
 * Pure sort/filter helpers for the library browse control bar. Kept free of
 * React and the query layer so they can be unit-tested as plain data
 * transforms — `LibraryPage` is just wiring around these.
 */
import type { LibraryItem } from '../../api/types.js';

export type SortKey = 'title' | 'author' | 'duration' | 'added';

/** `authors[]` wins when present (it's the richer, structured field); `author` is
 * the free-text fallback some upstream shapes send instead. */
function authorName(item: LibraryItem): string | null {
  const joined = item.media.authors?.map((a) => a.name).join(', ');
  if (joined && joined.length > 0) return joined;
  return item.media.author ?? null;
}

/** Missing data sorts last rather than throwing or floating to the top — an
 * incomplete record degrades to "least interesting", not "wins the sort". */
function compareStringNullsLast(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function compareNumberNullsLast(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

export function sortItems(items: LibraryItem[], key: SortKey): LibraryItem[] {
  const copy = [...items];
  switch (key) {
    case 'title':
      return copy.sort((a, b) => compareStringNullsLast(a.media.title, b.media.title));
    case 'author':
      return copy.sort((a, b) => compareStringNullsLast(authorName(a), authorName(b)));
    case 'duration':
      return copy.sort((a, b) => compareNumberNullsLast(a.media.duration, b.media.duration));
    case 'added':
      // `LibraryItem` (apps/web/src/api/types.ts) has no `addedAt` field yet, though
      // the BFF already sends one (packages/abs-client/src/normalize.ts) — this is a
      // placeholder ordering (id descending, stable and deterministic) until that
      // type is extended and this branch can sort on the real timestamp.
      return copy.sort((a, b) => b.id.localeCompare(a.id));
    default:
      return copy;
  }
}

export function filterItems(
  items: LibraryItem[],
  opts: { query: string; hideFinished: boolean },
): LibraryItem[] {
  const query = opts.query.trim().toLowerCase();
  return items.filter((item) => {
    if (opts.hideFinished && item.progress?.isFinished) return false;
    if (query.length === 0) return true;
    const title = item.media.title.toLowerCase();
    const author = (authorName(item) ?? '').toLowerCase();
    return title.includes(query) || author.includes(query);
  });
}
