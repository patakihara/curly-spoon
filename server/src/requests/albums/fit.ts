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

/** How many of `edition`'s titles the names of `audio` hold, by their words in order. */
function titlesHeld(audio: readonly TorrentFile[], edition: Edition): number {
  const names = audio.map((file) => wordsOf(file.path.split('/').pop()!.replace(AUDIO, '')));
  return edition.tracks.filter((track) => {
    const title = wordsOf(track.title);
    return names.some((name) => holdsRun(name, title));
  }).length;
}

/** Whether `files` hold `edition`: its track count in audio, most of its titles in their names. */
export function fitsEdition(files: readonly TorrentFile[], edition: Edition): boolean {
  const audio = audioFiles(files);
  if (audio.length !== edition.tracks.length || audio.length === 0) return false;
  return titlesHeld(audio, edition) >= TITLES_HELD * edition.tracks.length;
}

/** Why `files` hold none of `editions`, in words for the log. */
export function whyNoEdition(files: readonly TorrentFile[], editions: readonly Edition[]): string {
  if (editions.length === 0) return 'MusicBrainz lists no edition of the album';
  const audio = audioFiles(files);
  const sameCount = editions.filter((edition) => edition.tracks.length === audio.length);
  if (sameCount.length === 0 || audio.length === 0) {
    const counts = [...new Set(editions.map((edition) => edition.tracks.length))];
    const tracks = counts.sort((a, b) => a - b).join(', ');
    return `${audio.length} audio files; the editions have ${tracks} tracks`;
  }
  const held = Math.max(...sameCount.map((edition) => titlesHeld(audio, edition)));
  const needed = Math.ceil(TITLES_HELD * audio.length);
  return `${audio.length} audio files, as many as an edition’s tracks, but their names hold ${held} of its ${audio.length} titles (${needed} needed)`;
}

/** The first of `editions` that `files` hold, or null for none. */
export function fittingEdition(
  files: readonly TorrentFile[],
  editions: readonly Edition[],
): Edition | null {
  return editions.find((edition) => fitsEdition(files, edition)) ?? null;
}

/** A folder that holds one disc of an album: `CD1`, `Disc 2`, `disk 3`. */
const DISC_FOLDER = /^(?:cd|dis[ck])\s*\d+$/i;

/** Whether `path` lies inside `folder`, by whole path segments. */
export const inFolder = (path: string, folder: string): boolean => path.startsWith(`${folder}/`);

/** The album folder an audio file sits in: its own folder, or the one above a disc folder. */
function albumFolderOf(path: string): string {
  const parts = path.split('/').slice(0, -1);
  if (parts.length > 1 && DISC_FOLDER.test(parts.at(-1)!.trim())) parts.pop();
  return parts.join('/');
}

export interface AlbumFolder {
  folder: string;
  edition: Edition;
}

/**
 * A pack's album folder: of the folders holding audio, each with its disc folders, the one whose
 * files fit an edition, the edition listed first winning, then the folder first in path order. Null
 * for none.
 */
export function albumFolder(
  files: readonly TorrentFile[],
  editions: readonly Edition[],
): AlbumFolder | null {
  const folders = [...new Set(audioFiles(files).map((file) => albumFolderOf(file.path)))];
  let best: (AlbumFolder & { rank: number }) | null = null;
  for (const folder of folders) {
    const inside = files.filter((file) => inFolder(file.path, folder));
    const rank = editions.findIndex((edition) => fitsEdition(inside, edition));
    if (rank >= 0 && (best === null || rank < best.rank)) {
      best = { folder, edition: editions[rank]!, rank };
    }
  }
  return best === null ? null : { folder: best.folder, edition: best.edition };
}
