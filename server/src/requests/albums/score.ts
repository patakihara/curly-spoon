/**
 * Ranking the torrents an album's searches found, a pure `rankAlbumRows(rows, album)`.
 *
 * The same torrent shows on several indexers with sizes a few hundred bytes apart (live), so rows
 * merge first: by info hash, else by the title's words and a size within 0.5%. The merged row keeps
 * the most seeders, any file count, and any file list a link gave.
 *
 * A row that is plainly not the album in a format Auralis can tag is rejected and never offered:
 * nothing to fetch; the album's title or its artist missing from the title (a pack needs only the
 * artist; a file list that fits the album, or a Various Artists album, needs no artist); a marker
 * the album's own names lack (live, stems, a DVD…); a refused format; one file; a size too small
 * for its format, or too large for one album; a file list that fits none of the album's editions.
 *
 * The rest rank by format, then fit to the target edition (a file list that fits, then a file count
 * that could, then neither; a pack below a single album), then a sensible size, then whether
 * anyone seeds it (10 or more, then 1 to 9 or a web seed, then none), then nearness to the expected
 * size, then seeders. A **clear** row is FLAC, fits by its list or count, has a sensible size, is
 * seeded and is no pack: only such a row is started without a person choosing.
 */
import { createHash } from 'node:crypto';
import type { ProwlarrDetails, ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import { plainTitle } from '../../text/fold.js';
import type { TorrentFile } from '../download/torrentFiles.js';
import { infoHashFromMagnet } from '../download/torrentId.js';
import type { Release } from '../steps.js';
import type { Edition } from './editions.js';
import { fitsEdition, fittingEdition } from './fit.js';
import {
  type AlbumFormat,
  foreignMarkers,
  holdsRun,
  parseTitle,
  type TitleFacts,
  wordsOf,
} from './titles.js';

const MB = 1_000_000;
/** 16-bit CD FLAC: 277 MB for 42 minutes (live). */
const FLAC_MB_PER_MINUTE = 6.5;
/** The most a sensible FLAC is of the expected size: 24/44 at 1.8× is, 24/96 at 3× is not. */
const FLAC_SENSIBLE_TIMES = 2;
const MP3_320_SENSIBLE = { low: 2.0, high: 3.2 };
/** Below these a file is not what its title says: a lossy file renamed. */
const FLOOR_MB_PER_MINUTE: Partial<Record<AlbumFormat, number>> = { flac: 3.5, 'mp3-320': 1.5 };
/** Above this one album holds more: video, stems, several editions. Packs are exempt. */
const CEILING = { perMinute: 25, extra: 50 };
/** What each format is expected to weigh, for nearness. */
const EXPECTED_MB_PER_MINUTE: Record<AlbumFormat, number> = {
  flac: FLAC_MB_PER_MINUTE,
  'mp3-320': 2.4,
  mp3: 1.6,
  unknown: 2.4,
  refused: 0,
};
/** The other files a single album's torrent may hold beside its tracks: a cover, a log, a cue. */
const MOST_OTHER_FILES = 8;
/** A track's length where MusicBrainz names none. */
const UNKNOWN_TRACK_MS = 4 * 60_000;
const SAME_SIZE = 0.005;
/** MusicBrainz's Various Artists. */
export const VARIOUS_ARTISTS_ID = '89ad4ac3-39f7-470e-963a-56509c546377';

const FORMAT_RANK: Record<AlbumFormat, number> = {
  flac: 0,
  'mp3-320': 1,
  mp3: 2,
  unknown: 3,
  refused: 4,
};
const FORMAT_LABEL: Record<AlbumFormat, string> = {
  flac: 'FLAC',
  'mp3-320': 'MP3 320',
  mp3: 'MP3',
  unknown: 'format not named',
  refused: 'refused format',
};

/** What a search knows of the album it looks for. */
export interface AlbumFacts {
  title: string;
  /** The first credited artist's name. */
  artist: string;
  variousArtists: boolean;
  /** The edition a request brings. */
  target: Edition;
  editions: readonly Edition[];
}

/** A row as a search found it, with what its link answered, if it was asked. */
export interface AlbumRow {
  release: ProwlarrRelease;
  /** The torrent's files, from a link that gave a `.torrent`. */
  files?: TorrentFile[] | null;
  webSeed?: boolean;
}

/** One torrent, its rows from every indexer merged. */
export interface MergedRow {
  title: string;
  sources: string[];
  size: number | null;
  seeders: number | null;
  /** How many files the torrent holds, where an indexer or its file list says. */
  fileCount: number | null;
  files: TorrentFile[] | null;
  webSeed: boolean;
  infoHash: string | null;
  /** What it takes to fetch it: a magnet where any row had one, and a link where any had one. */
  details: ProwlarrDetails;
  /** Every link its rows have, to ask for a file list. */
  links: string[];
}

export type Fit = 'proved' | 'counted' | 'unknown';

export interface ScoredRow {
  row: MergedRow;
  facts: TitleFacts;
  fit: Fit;
  sensible: boolean;
  /** 0: 10 or more seeders; 1: 1 to 9, or a web seed; 2: none listed. */
  alive: 0 | 1 | 2;
  /** Why it is never offered, or null. */
  rejected: string | null;
}

/** The facts of an album from its group's title and artist credit, and its editions. */
export function albumFacts(
  group: { title: string; artistCredit: readonly { name: string; artistId: string }[] },
  editions: readonly Edition[],
  target: Edition,
): AlbumFacts {
  const first = group.artistCredit[0];
  return {
    title: group.title,
    artist: first?.name ?? '',
    variousArtists: first?.artistId === VARIOUS_ARTISTS_ID,
    target,
    editions,
  };
}

const hashOf = (release: ProwlarrRelease): string | null => {
  const { infoHash, magnet } = release.details;
  return infoHash?.toLowerCase() ?? (magnet === undefined ? null : infoHashFromMagnet(magnet));
};

const sameSize = (a: number | null, b: number | null) =>
  a !== null && b !== null && Math.abs(a - b) <= SAME_SIZE * Math.max(a, b);

/** Rows merged into one per torrent, in the order each torrent was first seen. */
export function mergeRows(rows: readonly AlbumRow[]): MergedRow[] {
  const merged: (MergedRow & { words: string })[] = [];
  for (const { release, files = null, webSeed = false } of rows) {
    const hash = hashOf(release);
    const words = wordsOf(release.title).join(' ');
    const one = merged.find((there) =>
      hash !== null && there.infoHash !== null
        ? there.infoHash === hash
        : there.words === words && sameSize(there.size, release.size),
    );
    const link = release.details.link;
    if (one === undefined) {
      merged.push({
        title: release.title,
        sources: [release.source],
        size: release.size,
        seeders: release.seeders,
        fileCount: files?.length ?? release.files,
        files,
        webSeed,
        infoHash: hash,
        details: { ...release.details, ...(hash === null ? {} : { infoHash: hash }) },
        links: link === undefined ? [] : [link],
        words,
      });
      continue;
    }
    if (!one.sources.includes(release.source)) one.sources.push(release.source);
    if ((release.seeders ?? -1) > (one.seeders ?? -1)) one.seeders = release.seeders;
    one.size ??= release.size;
    one.files ??= files;
    one.fileCount = one.files?.length ?? one.fileCount ?? release.files;
    one.webSeed ||= webSeed;
    one.infoHash ??= hash;
    if (link !== undefined && !one.links.includes(link)) one.links.push(link);
    const fetchLink = files !== null && link !== undefined ? link : (one.details.link ?? link);
    const magnet = one.details.magnet ?? release.details.magnet;
    one.details = {
      ...(fetchLink === undefined ? {} : { link: fetchLink }),
      ...(magnet === undefined ? {} : { magnet }),
      ...(one.infoHash === null ? {} : { infoHash: one.infoHash }),
    };
  }
  return merged.map(({ words: _, ...row }) => row);
}

/** The target edition's length in minutes. */
const minutesOf = (edition: Edition) =>
  edition.tracks.reduce((sum, track) => sum + (track.length ?? UNKNOWN_TRACK_MS), 0) / 60_000;

/** The bytes a row of `format` is expected to weigh for the target edition. */
export const expectedBytes = (format: AlbumFormat, album: AlbumFacts) =>
  EXPECTED_MB_PER_MINUTE[format] * minutesOf(album.target) * MB;

function rejection(row: MergedRow, facts: TitleFacts, album: AlbumFacts): string | null {
  const { link, magnet, infoHash } = row.details;
  if (link === undefined && magnet === undefined && infoHash === undefined)
    return 'nothing to fetch';
  if (facts.format === 'refused') return 'a format with no writer here';
  const foreign = foreignMarkers(facts, [album.title, album.artist]);
  if (foreign.length > 0) return `marked ${foreign.join(', ')}`;
  if (row.files !== null && fittingEdition(row.files, album.editions) === null && !facts.pack) {
    return 'its files fit no edition';
  }
  const hasArtist =
    album.variousArtists || holdsRun(facts.words, wordsOf(album.artist)) || provedBy(row, album);
  if (!hasArtist) return 'not the artist';
  if (!facts.pack && !holdsRun(facts.words, wordsOf(plainTitle(album.title)))) {
    return 'not the album';
  }
  if (row.fileCount === 1) return 'one file';
  if (row.size !== null) {
    const minutes = minutesOf(album.target);
    const floor = FLOOR_MB_PER_MINUTE[facts.format];
    if (floor !== undefined && row.size < floor * minutes * MB) return 'too small for its format';
    if (!facts.pack && row.size > (CEILING.perMinute * minutes + CEILING.extra) * MB) {
      return 'too large for one album';
    }
  }
  return null;
}

const provedBy = (row: MergedRow, album: AlbumFacts) =>
  row.files !== null && fitsEdition(row.files, album.target);

function fitOf(row: MergedRow, facts: TitleFacts, album: AlbumFacts): Fit {
  if (facts.pack) return 'unknown';
  if (row.files !== null) return provedBy(row, album) ? 'proved' : 'unknown';
  const tracks = album.target.tracks.length;
  const count = row.fileCount;
  return count !== null && count >= tracks && count <= tracks + MOST_OTHER_FILES
    ? 'counted'
    : 'unknown';
}

function sensibleOf(row: MergedRow, facts: TitleFacts, album: AlbumFacts): boolean {
  if (row.size === null || facts.pack) return false;
  const perMinute = row.size / MB / minutesOf(album.target);
  if (facts.format === 'flac') return perMinute <= FLAC_SENSIBLE_TIMES * FLAC_MB_PER_MINUTE;
  if (facts.format === 'mp3-320') {
    return perMinute >= MP3_320_SENSIBLE.low && perMinute <= MP3_320_SENSIBLE.high;
  }
  return false;
}

function aliveOf(row: MergedRow): 0 | 1 | 2 {
  const seeders = row.seeders ?? 0;
  if (seeders >= 10) return 0;
  return seeders > 0 || row.webSeed ? 1 : 2;
}

/** Each row scored, rejected ones included. */
export function scoreRows(rows: readonly MergedRow[], album: AlbumFacts): ScoredRow[] {
  return rows.map((row) => {
    const facts = parseTitle(row.title);
    return {
      row,
      facts,
      fit: fitOf(row, facts, album),
      sensible: sensibleOf(row, facts, album),
      alive: aliveOf(row),
      rejected: rejection(row, facts, album),
    };
  });
}

const FIT_RANK: Record<Fit, number> = { proved: 0, counted: 1, unknown: 2 };

function compare(album: AlbumFacts) {
  const nearness = (one: ScoredRow) =>
    one.row.size === null
      ? Number.POSITIVE_INFINITY
      : Math.abs(one.row.size - expectedBytes(one.facts.format, album));
  return (a: ScoredRow, b: ScoredRow) =>
    FORMAT_RANK[a.facts.format] - FORMAT_RANK[b.facts.format] ||
    FIT_RANK[a.fit] * 2 + Number(a.facts.pack) - (FIT_RANK[b.fit] * 2 + Number(b.facts.pack)) ||
    Number(b.sensible) - Number(a.sensible) ||
    a.alive - b.alive ||
    nearness(a) - nearness(b) ||
    (b.row.seeders ?? 0) - (a.row.seeders ?? 0) ||
    a.row.title.localeCompare(b.row.title);
}

/** The rows that may be offered, merged and best first. */
export function rankAlbumRows(rows: readonly AlbumRow[], album: AlbumFacts): ScoredRow[] {
  return scoreRows(mergeRows(rows), album)
    .filter((one) => one.rejected === null)
    .sort(compare(album));
}

/** Whether a row may be started with no person choosing it. */
export const isClear = (one: ScoredRow): boolean =>
  one.facts.format === 'flac' &&
  one.fit !== 'unknown' &&
  one.sensible &&
  one.alive < 2 &&
  !one.facts.pack;

/** A release to store and offer. Its details hold a download's address: never log them. */
export function toRelease(one: ScoredRow): Release {
  const { row, facts, fit } = one;
  const named = facts.format !== 'unknown';
  return {
    id: createHash('sha256')
      .update(row.infoHash ?? JSON.stringify(row.details))
      .digest('hex')
      .slice(0, 32),
    title: named ? row.title : `${row.title} (${FORMAT_LABEL.unknown})`,
    source: row.sources.join(', '),
    size: row.size !== null && Number.isSafeInteger(row.size) && row.size >= 0 ? row.size : null,
    details: {
      ...row.details,
      format: facts.format,
      fit,
      pack: facts.pack,
      fileCount: row.fileCount,
    },
  };
}
