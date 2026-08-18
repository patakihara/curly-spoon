/**
 * The book detail header's composed meta line — `docs/design/screens/BOOK_DETAIL.md`
 * §5's own example: `"Narrated by Rob Inglis · 19 h 07 m · 24 chapters · 38% listened"`.
 * A small pure function, tested directly, rather than four ad hoc JSX conditionals —
 * exactly what §5's "meta-line joining rule" asks for: join whichever of
 * narrator/duration/chapterCount/progressPercent are present, in that order, with no
 * separator artifacts (never `· ·`) when a field is missing.
 */

export interface ItemMetaFields {
  narrator?: string | null;
  durationSeconds?: number | null;
  chapterCount?: number | null;
  /** Already 0–100 and rounded — `ItemPage.tsx` derives this from `item.progress.progress` (0–1). */
  progressPercent?: number | null;
}

/** `"19 h 07 m"` above an hour, `"7 m"` below it — the design's own example is always
 * above an hour, but a short story or a single chapter shouldn't render `"0 h 07 m"`. */
export function formatDurationLong(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} m`;
  return `${hours} h ${String(minutes).padStart(2, '0')} m`;
}

export function composeItemMeta(fields: ItemMetaFields): string {
  const parts: string[] = [];
  if (fields.narrator) parts.push(`Narrated by ${fields.narrator}`);
  if (fields.durationSeconds != null && fields.durationSeconds > 0) {
    parts.push(formatDurationLong(fields.durationSeconds));
  }
  if (fields.chapterCount != null && fields.chapterCount > 0) {
    parts.push(`${fields.chapterCount} ${fields.chapterCount === 1 ? 'chapter' : 'chapters'}`);
  }
  if (fields.progressPercent != null) parts.push(`${fields.progressPercent}% listened`);
  return parts.join(' · ');
}
