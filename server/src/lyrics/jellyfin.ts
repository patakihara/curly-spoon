/**
 * Jellyfin's lyrics answer as lyric lines. A file whose every line has a `Start` (100 ns ticks) is
 * synced; one with no `Start` at all is plain, and so is a mix (never seen live). No lines, or
 * lines that are all empty, is none, as is no answer (Jellyfin's 404).
 */
import { type JellyfinLyrics } from '../adapters/jellyfin/schemas.js';
import { type Found, NOTHING_FOUND } from './choose.js';

const TICKS_PER_MS = 10_000;

export function fromJellyfin(answer: JellyfinLyrics | null): Found {
  const given = answer?.Lyrics ?? [];
  if (given.every((l) => l.Text.trim() === '')) return NOTHING_FOUND;
  if (given.every((l) => l.Start != null)) {
    return {
      status: 'synced',
      lines: given.map((l) => ({
        start: Math.round((l.Start ?? 0) / TICKS_PER_MS) / 1000,
        text: l.Text.trim(),
      })),
    };
  }
  const lines = given.map((l) => ({ start: null, text: l.Text.trimEnd() }));
  while (lines.at(-1)?.text.trim() === '') lines.pop();
  return { status: 'plain', lines };
}
