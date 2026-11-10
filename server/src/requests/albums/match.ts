/**
 * Which edition of the album a finished torrent's files are, by what the files themselves say: each
 * audio file's length from its headers (FLAC's `STREAMINFO`, exact; MP3's `Xing`, `Info` or `VBRI`
 * frame), and its track and disc numbers from its own tags, else its name (`03 - …`, `1-03 …`) and
 * folder (`CD1`, `Disc 2`). A track there as both FLAC and MP3 counts once, as its FLAC.
 *
 * Every edition is tried, the most shared first: one fits when it has as many tracks as the files,
 * and each file in order is within 4 s of its track (M3.keep's tolerance; a track MusicBrainz gives
 * no length passes). Of that edition's releases, the files are tagged from one whose disc layout is
 * theirs (`releaseFor`). Files that fit no edition are not the album: `wrongRelease`.
 *
 * Only files qBittorrent fetched are read (priority above 0, so a pack's other albums stay out), and
 * each must be a plain file inside the save path, as long as qBittorrent says: a link, a `../` or a
 * short file stops the import before anything is made.
 */
import { lstat, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { audioDurationMs } from '../../music/audio/duration.js';
import { trackFields } from '../../music/audio/fields.js';
import { MATCH_LENGTH_MS } from '../songs/match.js';
import type { TorrentFile } from '../download/torrentFiles.js';
import { type Edition, type EditionRelease, releaseFor } from './editions.js';
import { audioFiles } from './fit.js';
import { AlbumRefused } from './refused.js';

/** One audio file of the download. */
export interface DownloadedTrack {
  /** As qBittorrent lists it, under the save path. */
  name: string;
  /** Where it is here. */
  path: string;
  extension: 'flac' | 'mp3';
  /** Null when its headers do not say. */
  durationMs: number | null;
  disc: number;
  track: number | null;
}

/** A torrent's own path in parts, refusing any that could lead out of where it is. */
function pathParts(name: string): string[] {
  if (name.includes('\0') || name.includes('\\') || name.startsWith('/')) {
    throw new AlbumRefused('unsafePath');
  }
  const parts = name.split('/');
  for (const part of parts) {
    const seen = part.normalize('NFKC');
    if (part === '' || part === '.' || seen === '..' || seen.includes('/') || seen.includes('\\')) {
      throw new AlbumRefused('unsafePath');
    }
  }
  return parts;
}

/** A plain file inside the save path, at least `size` bytes; else the import stops. */
export async function checkedSource(savePath: string, file: TorrentFile): Promise<string> {
  const path = join(savePath, ...pathParts(file.path));
  const stat = await lstat(path).catch(() => null);
  if (stat === null) throw new AlbumRefused('notARegularFile');
  if (stat.isSymbolicLink()) throw new AlbumRefused('unsafePath');
  if (!stat.isFile() || stat.size < file.size) throw new AlbumRefused('notARegularFile');
  const inside = await realpath(savePath);
  if (!(await realpath(path)).startsWith(`${inside}${sep}`)) throw new AlbumRefused('unsafePath');
  return path;
}

const DISC_FOLDER = /^(?:cd|dis[ck])\s*(\d+)$/i;
const NUMBERED = /^(?:(\d{1,2})-)?(\d{1,3})(?!\d)/;

/** The disc and track a file's place in the torrent names, where its tags say nothing. */
function namedPlace(name: string): { disc: number | null; track: number | null } {
  const parts = name.split('/');
  const folder = parts.length > 1 ? DISC_FOLDER.exec(parts.at(-2)!.trim()) : null;
  const numbered = NUMBERED.exec(parts.at(-1)!);
  const disc = folder?.[1] ?? numbered?.[1];
  return {
    disc: disc === undefined ? null : Number(disc),
    track: numbered?.[2] === undefined ? null : Number(numbered[2]),
  };
}

/** The download's audio files, read and in play order: by disc, then track, then name. */
export async function downloadedTracks(
  savePath: string,
  files: readonly TorrentFile[],
): Promise<DownloadedTrack[]> {
  const tracks: DownloadedTrack[] = [];
  for (const file of audioFiles(files)) {
    const path = await checkedSource(savePath, file);
    const fields = await trackFields(path);
    const named = namedPlace(file.path);
    tracks.push({
      name: file.path,
      path,
      extension: file.path.toLowerCase().endsWith('.flac') ? 'flac' : 'mp3',
      durationMs: await audioDurationMs(path),
      disc: fields.discNumber ?? named.disc ?? 1,
      track: fields.trackNumber ?? named.track,
    });
  }
  return tracks.sort(
    (a, b) =>
      a.disc - b.disc ||
      (a.track ?? Infinity) - (b.track ?? Infinity) ||
      a.name.localeCompare(b.name, 'en', { numeric: true }),
  );
}

/** How many tracks each disc holds, in disc order. */
export function discLayout(tracks: readonly DownloadedTrack[]): number[] {
  const counts = new Map<number, number>();
  for (const { disc } of tracks) counts.set(disc, (counts.get(disc) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([, count]) => count);
}

export interface AlbumMatch {
  edition: Edition;
  /** The release the files are tagged from. */
  release: EditionRelease;
  /** The files in the edition's order, one for each of its tracks. */
  tracks: DownloadedTrack[];
}

const fits = (tracks: readonly DownloadedTrack[], edition: Edition) =>
  tracks.length === edition.tracks.length &&
  tracks.length > 0 &&
  edition.tracks.every(({ length }, i) => {
    const heard = tracks[i]!.durationMs;
    return length === null || (heard !== null && Math.abs(heard - length) <= MATCH_LENGTH_MS);
  });

/** The first edition the files are, with the release to tag them from; null when they are none. */
export function matchEdition(
  tracks: readonly DownloadedTrack[],
  editions: readonly Edition[],
): AlbumMatch | null {
  const edition = editions.find((one) => fits(tracks, one));
  if (edition === undefined) return null;
  return { edition, release: releaseFor(edition, discLayout(tracks)), tracks: [...tracks] };
}
