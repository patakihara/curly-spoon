/**
 * An album request's search step. MusicBrainz names the album by its release group id, and the
 * request's title and artist, a client's text, are never sent on: the queries are made from the
 * group's own title and artist credit.
 *
 * Prowlarr is asked one query form a turn, in order, stopping at the first clear winner:
 *   1. `<artist> <album>`, the credit as written, the title's brackets dropped and its dashes
 *      hyphens (MusicBrainz writes "Ghosts I–IV" where torrents write "Ghosts I-IV");
 *   2. `<album>` alone, skipped for a title of one short word ("Discovery", "Rumours"), which then
 *      finds only noise, and always run for Various Artists;
 *   3. `<artist> discography`, not for Various Artists.
 * One search takes about 30 s (live) and a step may take 120 s, so a turn asks at most one thing of
 * Prowlarr: one form, or the links of the best few FLAC rows whose fit is unknown, which give a file
 * list (a `.torrent`) or a hash (a magnet) before any download. Whatever it already asked within
 * the day is read back. A turn with more left to ask answers `waiting`.
 *
 * A clear winner is picked with up to 3 others that are clear too, so a stall or a wrong release
 * goes on only to an equally clear one. Once every form is asked with none clear, a person chooses
 * from the best 10, lossy rows and packs included; none at all left is `noRelease`.
 */
import type { ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import type { Db } from '../../store/connection.js';
import { releasesOf } from '../../store/requests.js';
import { plainTitle } from '../../text/fold.js';
import type { MediumSteps, SearchOutcome } from '../steps.js';
import { type AlbumEditions, targetEdition } from './editions.js';
import type { ProwlarrCache } from './prowlarrCache.js';
import {
  type AlbumFacts,
  albumFacts,
  type AlbumRow,
  isClear,
  rankAlbumRows,
  type ScoredRow,
  toRelease,
  VARIOUS_ARTISTS_ID,
} from './score.js';

/** The most a picked release takes along for when it fails. */
const MAX_OTHERS = 3;
/** The most a person is offered. */
const MAX_CANDIDATES = 10;
/** How many unproved FLAC rows a turn asks the links of. */
const LINKS_ASKED = 3;
/** A title of one word this long or shorter is not searched alone. */
const SHORT_WORD = 10;

const DASHES = /[‐-―−]/g;

export interface AlbumSearchDeps {
  db: Db;
  editions: Pick<AlbumEditions, 'read'>;
  prowlarr: Pick<ProwlarrCache, 'kept' | 'search' | 'keptLink' | 'askLink'>;
  log?: JobLog;
}

interface Group {
  title: string;
  artistCredit: readonly { name: string; joinPhrase: string; artistId: string }[];
}

/** The query forms for a release group, in the order they are asked. */
export function queryForms(group: Group): string[] {
  const various = group.artistCredit[0]?.artistId === VARIOUS_ARTISTS_ID;
  const artist = group.artistCredit
    .map((credit) => `${credit.name}${credit.joinPhrase}`)
    .join('')
    .replace(DASHES, '-')
    .trim();
  const title = plainTitle(group.title).replace(DASHES, '-');
  const oneShortWord = !/\s/.test(title) && title.length <= SHORT_WORD;
  return [
    ...(artist === '' ? [] : [`${artist} ${title}`]),
    ...(various || !oneShortWord ? [title] : []),
    ...(various || artist === '' ? [] : [`${artist} discography`]),
  ];
}

/** The recordings of songs kept, or being kept, from this release group. */
function keptRecordings(db: Db, groupId: string, log?: JobLog): string[] {
  return releasesOf(db, 'song', log).flatMap(({ details }) => {
    const match = details.match as Partial<Record<string, unknown>> | undefined;
    return match?.releaseGroupId === groupId && typeof match.recordingId === 'string'
      ? [match.recordingId]
      : [];
  });
}

/** The rows with what their links answered: a hash, and a torrent's files and web seed. */
function withAnswers(deps: AlbumSearchDeps, pool: readonly ProwlarrRelease[]): AlbumRow[] {
  return pool.map((release) => {
    const { link } = release.details;
    const answer = link === undefined ? undefined : deps.prowlarr.keptLink(link);
    if (answer === undefined || answer === null) return { release };
    return {
      release: { ...release, details: { ...release.details, infoHash: answer.hash } },
      files: answer.files,
      webSeed: answer.webSeed,
    };
  });
}

/**
 * The links worth asking: those of the best few FLAC single-album rows whose fit is unknown, as the
 * rows rank before any link is asked, so the same pool always names the same links.
 */
function linksWorthAsking(pool: readonly ProwlarrRelease[], album: AlbumFacts): string[] {
  return rankAlbumRows(
    pool.map((release) => ({ release })),
    album,
  )
    .filter((one) => one.facts.format === 'flac' && !one.facts.pack && one.fit === 'unknown')
    .filter((one) => one.row.links.length > 0)
    .slice(0, LINKS_ASKED)
    .flatMap((one) => one.row.links);
}

function picked(ranked: readonly ScoredRow[]): SearchOutcome | null {
  const clear = ranked.filter(isClear);
  const [best, ...others] = clear;
  if (best === undefined) return null;
  return {
    kind: 'picked',
    release: toRelease(best),
    others: others.slice(0, MAX_OTHERS).map(toRelease),
  };
}

export function albumSearch(deps: AlbumSearchDeps): MediumSteps['search'] {
  return async (request): Promise<SearchOutcome> => {
    const groupId = request.target.ids.mbid;
    const found = groupId === undefined ? null : await deps.editions.read(groupId);
    if (groupId === undefined || found === null) return { kind: 'none', reason: 'noRelease' };
    const target = targetEdition(found.editions, keptRecordings(deps.db, groupId, deps.log));
    if (target === null) return { kind: 'none', reason: 'noRelease' };
    const album = albumFacts(found.group, found.editions, target);

    let asked = false;
    const pool: ProwlarrRelease[] = [];
    for (const query of queryForms(found.group)) {
      let rows = await deps.prowlarr.kept(query);
      if (rows === null) {
        if (asked) return { kind: 'waiting' };
        rows = await deps.prowlarr.search(query);
        asked = true;
      }
      pool.push(...rows);
      const clear = picked(rankAlbumRows(withAnswers(deps, pool), album));
      if (clear !== null) return clear;

      const links = linksWorthAsking(pool, album).filter(
        (link) => deps.prowlarr.keptLink(link) === undefined,
      );
      if (links.length === 0) continue;
      if (asked) return { kind: 'waiting' };
      for (const link of links) await deps.prowlarr.askLink(link);
      asked = true;
      const proved = picked(rankAlbumRows(withAnswers(deps, pool), album));
      if (proved !== null) return proved;
    }
    const ranked = rankAlbumRows(withAnswers(deps, pool), album);
    if (ranked.length === 0) return { kind: 'none', reason: 'noRelease' };
    return { kind: 'choose', candidates: ranked.slice(0, MAX_CANDIDATES).map(toRelease) };
  };
}
