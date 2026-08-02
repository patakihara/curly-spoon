/**
 * Time formatting and arithmetic shared by every player surface.
 *
 * All functions are total: they never throw, and non-finite or negative input
 * degrades to the sensible zero value rather than rendering `NaN:NaN` in the UI.
 */

const HOUR = 3600;
const MINUTE = 60;

/** Coerce anything into a usable, non-negative number of seconds. */
function safeSeconds(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * `m:ss`, or `h:mm:ss` once the duration reaches an hour.
 * Used for the transport clock and chapter timings.
 */
export function formatClock(seconds: number): string {
  const total = Math.floor(safeSeconds(seconds));
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const secs = total % MINUTE;

  const paddedSecs = String(secs).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

/**
 * Human phrasing for list rows and detail pages: `12h 34m`, `1h`, `45m`.
 * Minutes are dropped entirely when zero so we never render "2h 0m".
 */
export function formatDurationLong(seconds: number): string {
  const total = Math.floor(safeSeconds(seconds));
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

/** "30m left" / "Finished" — the progress caption under a cover. */
export function formatRemaining(position: number, duration: number): string {
  const total = safeSeconds(duration);
  if (total === 0) return '';

  const remaining = total - safeSeconds(position);
  if (remaining <= 0) return 'Finished';
  return `${formatDurationLong(remaining)} left`;
}

/** Parse `42`, `m:ss` or `h:mm:ss` into seconds; `null` when unparseable. */
export function parseClock(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  const parts = trimmed.split(':');
  if (parts.length > 3) return null;

  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    seconds = seconds * MINUTE + Number(part);
  }
  return seconds;
}

/** Progress as a clamped 0..1 ratio, safe when the duration is unknown. */
export function percentOf(position: number, duration: number): number {
  const total = safeSeconds(duration);
  if (total === 0) return 0;
  return Math.min(1, Math.max(0, safeSeconds(position) / total));
}

/** Constrain a requested seek target to the bounds of the media. */
export function clampTime(position: number, duration: number): number {
  return Math.min(safeSeconds(duration), Math.max(0, safeSeconds(position)));
}
