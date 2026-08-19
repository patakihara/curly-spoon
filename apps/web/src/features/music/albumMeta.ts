/**
 * The album detail header's composed meta line —
 * `docs/design/screens/ALBUM_DETAIL.md` §5's own literal example:
 * `"2021 · Synthwave · 2 tracks · 7 m"`. Mirrors `features/item/itemMeta.ts`'s
 * `composeItemMeta` (join whichever fields are present, `·`-separated, no
 * separator artifacts when one is missing) but kept screen-scoped rather than
 * shared, per §5's own instruction — `formatDurationLong` is imported from
 * `itemMeta.ts` rather than duplicated.
 */
import { formatDurationLong } from '../item/itemMeta.js';

export interface AlbumMetaFields {
  productionYear?: number | null;
  /** Only the first genre (§5) — joining an unbounded list would make the meta line grow
   * without limit for a heavily-tagged album. `null`/absent omits the segment. */
  genre?: string | null;
  /**
   * The album's total track count. `null` means "not yet known" — the first page of tracks
   * hasn't loaded yet, and the whole meta line renders as `null` in that case (§5's "omit
   * entirely" rule, read as applying to this pre-load state). Once known, track count is
   * *never* omitted — not even `0` for a genuinely empty album, matching
   * `PODCAST_DETAIL.md` §5's identical reasoning for its own always-shown unplayed count.
   */
  trackCount: number | null;
  /**
   * Only present when computable: the whole album fits in one page (`total <= 40`) and that
   * page has fully loaded (§5). `null`/absent omits the segment — fetching every page of a
   * multi-page album purely to build one header string is a deliberate limitation, not an
   * oversight.
   */
  durationSeconds?: number | null;
}

export function composeAlbumMeta(fields: AlbumMetaFields): string | null {
  if (fields.trackCount === null) return null;
  const parts: string[] = [];
  if (fields.productionYear != null) parts.push(String(fields.productionYear));
  if (fields.genre) parts.push(fields.genre);
  parts.push(`${fields.trackCount} ${fields.trackCount === 1 ? 'track' : 'tracks'}`);
  if (fields.durationSeconds != null) parts.push(formatDurationLong(fields.durationSeconds));
  return parts.join(' · ');
}
