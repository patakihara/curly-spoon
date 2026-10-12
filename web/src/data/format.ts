import { type ArtSize } from '@auralis/schema';

/**
 * How the pages write what the API answers in numbers: a place in an item as a clock, a length in
 * words, a publishing date, and the art URL at the size it is drawn.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** A place in an item, `seconds` from its start: `4:02`, `52:00`, `1:04:00`. */
export function clock(seconds: number): string {
  const whole = Math.floor(Math.max(0, seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A length: `5 s`, `18 min`, `1 h 2 m`. */
export function span(seconds: number): string {
  const whole = Math.round(Math.max(0, seconds));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

const DAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** A publishing date, milliseconds since the epoch: `12 Aug 2026`. */
export function day(at: number): string {
  return DAY.format(at);
}

/** The art at `size`; none (an empty source, which draws the art's fallback) where there is none. */
export function artAt(art: string | null, size: ArtSize): string {
  return art === null ? '' : `${art}?size=${size}`;
}

/**
 * A page's shape with nothing in it, what it draws while its data loads: every list empty, every
 * word blank, every number 0 and every switch off.
 */
export function emptied<T>(value: T): T {
  if (Array.isArray(value)) return [] as T;
  if (typeof value === 'string') return '' as T;
  if (typeof value === 'number') return 0 as T;
  if (typeof value === 'boolean') return false as T;
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, emptied(v)])) as T;
}
