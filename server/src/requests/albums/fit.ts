/**
 * Whether a torrent's file list is an edition of the album. Audio files are `.flac` and `.mp3`, in
 * any case; a track there as both (Internet Archive's torrents list FLAC and MP3 side by side,
 * live) counts once, as its FLAC. A list fits an edition when its audio count equals the edition's
 * track count and at least 70% of the edition's titles are in the file names, by their words in
 * order (a number without its leading zeros, so "01 - 1 Ghosts I" holds "1 Ghosts I").
 */
import type { TorrentFile } from '../download/torrentFiles.js';
import type { Edition } from './editions.js';
import { holdsRun, wordsOf } from './titles.js';

const AUDIO = /\.(flac|mp3)$/i;
/** The share of an edition's titles the file names must hold. */
const TITLES_HELD = 0.7;

/** The audio files of a list, a track's FLAC in place of its MP3, in path order. */
export function audioFiles(files: readonly TorrentFile[]): TorrentFile[] {
  const byStem = new Map<string, TorrentFile>();
  for (const file of files) {
    const kind = AUDIO.exec(file.path)?.[1]?.toLowerCase();
    if (kind === undefined) continue;
    const stem = file.path.slice(0, -kind.length - 1);
    const there = byStem.get(stem);
    if (there === undefined || kind === 'flac') byStem.set(stem, file);
  }
  return [...byStem.values()].sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }));
}

/** Whether `files` hold `edition`: its track count in audio, most of its titles in their names. */
export function fitsEdition(files: readonly TorrentFile[], edition: Edition): boolean {
  const audio = audioFiles(files);
  if (audio.length !== edition.tracks.length || audio.length === 0) return false;
  const names = audio.map((file) => wordsOf(file.path.split('/').pop()!.replace(AUDIO, '')));
  const held = edition.tracks.filter((track) => {
    const title = wordsOf(track.title);
    return names.some((name) => holdsRun(name, title));
  }).length;
  return held >= TITLES_HELD * edition.tracks.length;
}

/** The first of `editions` that `files` hold, or null for none. */
export function fittingEdition(
  files: readonly TorrentFile[],
  editions: readonly Edition[],
): Edition | null {
  return editions.find((edition) => fitsEdition(files, edition)) ?? null;
}
