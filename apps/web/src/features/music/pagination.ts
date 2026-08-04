/**
 * Pure pagination arithmetic for a Jellyfin library page. Jellyfin's `/Items`
 * endpoint always returns `TotalRecordCount` alongside a page, so paging here
 * never has to guess a total — see `apps/server/src/routes/jellyfin.ts`'s doc
 * comment and `packages/jellyfin-client/src/domain.ts`'s `LibraryPage`. Kept
 * separate from the components that call it so it's testable without React or
 * a network, the same pattern `features/library/sorting.ts` uses.
 *
 * Every input is degraded rather than rejected — a negative `startIndex` (from
 * a stale "Previous" click racing a shrinking library) or a negative `total`
 * clamps to zero instead of producing a nonsensical or throwing result.
 */

export interface PageWindow {
  /** Index of the first item in the current page, 0-based. */
  startIndex: number;
  /** Requested page size. */
  limit: number;
}

export interface PageSummary extends PageWindow {
  /** Total matching records upstream. */
  total: number;
  /** How many items the current page actually returned — may be less than
   * `limit` on the last page, or 0 for an out-of-range `startIndex`. */
  count: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** `startIndex` to request for "Next" — `null` when there is no next page. */
  nextStartIndex: number | null;
  /** `startIndex` to request for "Previous" — `null` when there is no previous page. */
  previousStartIndex: number | null;
  /** Human-readable "1–20 of 45", degrading to "0 of 0" for an empty result. */
  rangeLabel: string;
}

export function summarizePage(window: PageWindow, total: number, count: number): PageSummary {
  const safeTotal = Math.max(0, total);
  const startIndex = Math.max(0, window.startIndex);
  const safeCount = Math.max(0, count);

  const hasPrevious = startIndex > 0;
  const rangeEnd = startIndex + safeCount;
  const hasNext = rangeEnd < safeTotal;
  const rangeStart = safeCount === 0 ? 0 : startIndex + 1;

  return {
    startIndex,
    limit: window.limit,
    total: safeTotal,
    count: safeCount,
    hasPrevious,
    hasNext,
    nextStartIndex: hasNext ? startIndex + window.limit : null,
    previousStartIndex: hasPrevious ? Math.max(0, startIndex - window.limit) : null,
    rangeLabel: safeTotal === 0 ? '0 of 0' : `${rangeStart}–${rangeEnd} of ${safeTotal}`,
  };
}
