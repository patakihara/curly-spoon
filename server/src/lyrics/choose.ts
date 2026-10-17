/**
 * Which lyrics a track gets, from what Jellyfin and LRCLIB each found. Synced from either beats
 * plain from either; LRCLIB's word that a recording is instrumental beats an untimed Jellyfin
 * file (the household's untimed files on instrumental albums are release-group watermarks).
 */
import { type LyricLine } from './lrc.js';

export type LyricsStatus = 'synced' | 'plain' | 'instrumental' | 'none';
export type LyricsOrigin = 'jellyfin' | 'lrclib';

/** What one source found for a track. */
export interface Found {
  status: LyricsStatus;
  /** Timed for synced, untimed for plain, `[]` for instrumental and none. */
  lines: LyricLine[];
}

/** A track's lyrics, as Auralis answers them; `source` is null exactly when status is none. */
export interface LyricsAnswer extends Found {
  source: LyricsOrigin | null;
}

export const NOTHING_FOUND: Found = { status: 'none', lines: [] };

/**
 * First match wins: Jellyfin synced, LRCLIB synced, LRCLIB instrumental, Jellyfin plain, LRCLIB
 * plain, none. `lrclib` is null when LRCLIB was not asked.
 */
export function chooseLyrics(jellyfin: Found, lrclib: Found | null): LyricsAnswer {
  const order: [LyricsOrigin, Found | null, LyricsStatus][] = [
    ['jellyfin', jellyfin, 'synced'],
    ['lrclib', lrclib, 'synced'],
    ['lrclib', lrclib, 'instrumental'],
    ['jellyfin', jellyfin, 'plain'],
    ['lrclib', lrclib, 'plain'],
  ];
  for (const [source, found, status] of order) {
    if (found?.status === status) return { status, source, lines: found.lines };
  }
  return { status: 'none', source: null, lines: [] };
}
