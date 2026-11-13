/**
 * What Search lists of the albums the library lacks: MusicBrainz's release-group search, kept five
 * minutes, the best five at score 90 or more, and for each the row a person sees. MusicBrainz holds
 * the release group id an album request needs. A search waits for it only up to the limit, and
 * anything going wrong is no rows, never a failed search. A row's cover is the Cover Art Archive's
 * front for its group, asked by that id alone.
 *
 * An album the household holds is left out, by its release group id where Jellyfin has one, else by
 * the folded words of its title and its album artist, as household files carry no ids. One whose
 * every track is a song kept from YouTube Music stays, as asking for it brings the lossless album
 * in their place; its row says how many of them the person kept. The same album's page offers the
 * request too (`albumRequestOf`), when its kept songs all name one release group.
 */
import type { RequestRef, SearchAlbum, AlbumType } from '@auralis/schema';
import { RequestRef as RequestRefSchema } from '@auralis/schema';
import type { CoverArtClient } from '../../adapters/coverart/client.js';
import type { MusicBrainzClient } from '../../adapters/musicbrainz/client.js';
import type { ReleaseGroupHit } from '../../adapters/musicbrainz/schemas.js';
import type { JobLog } from '../../jobs/schedule.js';
import { albumTracks, type StoredRow, topLevelOfKind } from '../../libraryIndex/store.js';
import type { Db } from '../../store/connection.js';
import { peopleOn, requestsInLibrary, type StoredRequest } from '../../store/requests.js';
import { searchFold } from '../../text/fold.js';
import { requestStanding } from '../standing.js';
import { keptSong } from './replace.js';

const SEARCH_LIMIT_MS = 3_000;
const KEPT_MS = 5 * 60_000;
const MOST_KEPT = 200;
const ART_LIMIT_MS = 5_000;
/** The lowest MusicBrainz score listed, and the most rows. */
const LEAST_SCORE = 90;
const MOST_ROWS = 5;

export interface AlbumCover {
  type: string;
  bytes: Uint8Array;
}

export interface AlbumCatalogue {
  /** The release groups this search finds; none past the limit, on any failure, or once `gone` aborts. */
  search(q: string, gone: AbortSignal): Promise<ReleaseGroupHit[]>;
  /** A found album's front cover; null when there is none to give. */
  art(mbid: string, gone: AbortSignal): Promise<AlbumCover | null>;
  /** Whether covers can be asked for at all. */
  hasArt: boolean;
}

export interface AlbumCatalogueDeps {
  musicBrainz: Pick<MusicBrainzClient, 'searchReleaseGroups'>;
  /** Null when the Cover Art Archive is switched off. */
  coverArt: Pick<CoverArtClient, 'groupFront'> | null;
  now: () => number;
  log: JobLog;
  limitMs?: number;
}

/** Forgets the oldest once the map is full; a map keeps the order things were added in. */
function remember<V>(kept: Map<string, V>, key: string, value: V): void {
  kept.delete(key);
  kept.set(key, value);
  const oldest = kept.keys().next().value;
  if (kept.size > MOST_KEPT && oldest !== undefined) kept.delete(oldest);
}

/** Resolves to `fallback` once `ms` pass or `gone` aborts, whichever is first. */
async function within<T>(work: Promise<T>, ms: number, gone: AbortSignal, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let stop: () => void = () => undefined;
  // The injected fetch may ignore every signal, so the limit is held here as well.
  const stopped = new Promise<T>((resolve) => {
    stop = () => resolve(fallback);
    timer = setTimeout(stop, ms);
    gone.addEventListener('abort', stop, { once: true });
  });
  try {
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    gone.removeEventListener('abort', stop);
  }
}

export function albumCatalogue(deps: AlbumCatalogueDeps): AlbumCatalogue {
  const { musicBrainz, coverArt, now, log } = deps;
  const limitMs = deps.limitMs ?? SEARCH_LIMIT_MS;
  const searches = new Map<string, { at: number; found: Promise<ReleaseGroupHit[]> }>();

  const ask = (q: string, key: string) => {
    const found = musicBrainz
      .searchReleaseGroups(q)
      .then(({ releaseGroups }) =>
        releaseGroups.filter(({ score }) => score >= LEAST_SCORE).slice(0, MOST_ROWS),
      );
    // A failure is not kept: the next search asks again.
    found.catch(() => searches.delete(key));
    remember(searches, key, { at: now(), found });
    return found;
  };

  return {
    hasArt: coverArt !== null,

    async search(q, gone) {
      const key = searchFold(q);
      const kept = searches.get(key);
      const found = kept !== undefined && now() - kept.at < KEPT_MS ? kept.found : ask(q, key);
      try {
        return await within(found, limitMs, gone, []);
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no album rows');
        return [];
      }
    },

    async art(mbid, gone) {
      if (coverArt === null) return null;
      try {
        const cover = await within(coverArt.groupFront(mbid), ART_LIMIT_MS, gone, null);
        return cover === null ? null : { type: cover.mime, bytes: cover.bytes };
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no album cover');
        return null;
      }
    },
  };
}

const fold = (text: string) => searchFold(text).trim();

const TYPES: Record<string, AlbumType> = {
  album: 'album',
  ep: 'ep',
  single: 'single',
  broadcast: 'broadcast',
};
const typeOf = (primary: string | null): AlbumType | null =>
  primary === null ? null : (TYPES[primary.toLowerCase()] ?? 'other');

/** The group's artist credit as MusicBrainz writes it; null when it names nobody. */
const creditOf = (hit: ReleaseGroupHit): string | null => {
  const credit = hit.artistCredit
    .map(({ name, joinPhrase }) => `${name}${joinPhrase}`)
    .join('')
    .trim();
  return credit === '' ? null : credit;
};

const albumArtist = (row: StoredRow) =>
  row.creators.find(({ role }) => role === 'album-artist')?.name ?? row.creators[0]?.name ?? null;

/** A kept song by the Jellyfin track it arrived as. */
interface Kept {
  request: StoredRequest;
  releaseGroupId: string | null;
}

/** Every kept song the library holds, by its Jellyfin track. */
function keptByTrack(db: Db): Map<string, Kept> {
  const byTrack = new Map<string, Kept>();
  for (const request of requestsInLibrary(db, 'song')) {
    const { result } = request;
    if (result?.source !== 'jellyfin') continue;
    const song = keptSong(request);
    const releaseGroupId = song?.match.source === 'MusicBrainz' ? song.match.releaseGroupId : null;
    byTrack.set(result.id, { request, releaseGroupId });
  }
  return byTrack;
}

/** The kept songs an album holds, one a track, or null when any track is the household's own. */
function keptOnly(db: Db, album: StoredRow, kept: Map<string, Kept>): Kept[] | null {
  const tracks = albumTracks(db, album.id);
  if (tracks.length === 0) return null;
  const songs = tracks.map(({ id }) => kept.get(id));
  return songs.every((song) => song !== undefined) ? (songs as Kept[]) : null;
}

/**
 * The request for this album's lossless copy: on an album whose every track is a kept song, all those
 * matched on MusicBrainz naming one release group; else null, as for songs kept on YouTube Music's
 * names alone.
 */
export function albumRequestOf(db: Db, album: StoredRow): RequestRef | null {
  if (album.kind !== 'album') return null;
  const songs = keptOnly(db, album, keptByTrack(db));
  if (songs === null) return null;
  const groups = new Set(songs.flatMap(({ releaseGroupId }) => releaseGroupId ?? []));
  const [mbid] = groups;
  if (groups.size !== 1 || mbid === undefined) return null;
  const ref = RequestRefSchema.safeParse({
    medium: 'album',
    target: { title: album.title, creator: albumArtist(album), ids: { mbid } },
  });
  return ref.success ? ref.data : null;
}

/** The rows these found albums make for this person, in the order they were found. */
export function albumRows(
  db: Db,
  userId: string,
  hits: readonly ReleaseGroupHit[],
  options: { art: boolean },
): SearchAlbum[] {
  if (hits.length === 0) return [];
  const owned = topLevelOfKind(db, 'album');
  const kept = keptByTrack(db);
  return hits.flatMap((hit) => {
    const artist = creditOf(hit);
    const ref = RequestRefSchema.safeParse({
      medium: 'album',
      target: { title: hit.title, creator: artist, ids: { mbid: hit.id } },
    });
    if (!ref.success) return [];
    const held = owned.filter((row) => {
      const group = row.ids['musicbrainz_release_group'];
      if (group !== undefined) return group === hit.id;
      const by = albumArtist(row);
      return (
        fold(row.title) === fold(hit.title) &&
        (by === null || artist === null || fold(by) === fold(artist))
      );
    });
    const songs = held.map((row) => keptOnly(db, row, kept));
    const isOwned = held.length > 0 && songs.some((one) => one === null);
    const standing = requestStanding(db, userId, ref.data, isOwned);
    if (standing === 'owned') return [];
    const mine = new Set<string>();
    const fromGroup = [...kept.values()].filter((one) => one.releaseGroupId === hit.id);
    for (const one of [...songs.flatMap((held) => held ?? []), ...fromGroup]) {
      if (peopleOn(db, one.request.id).includes(userId)) mine.add(one.request.id);
    }
    const year = hit.firstReleaseDate === null ? null : Number(hit.firstReleaseDate.slice(0, 4));
    return [
      {
        ref: ref.data,
        title: hit.title,
        artist,
        year: year !== null && Number.isInteger(year) ? year : null,
        type: typeOf(hit.primaryType),
        art: options.art ? `/api/search/albums/${hit.id}/art` : null,
        status: standing?.status ?? null,
        progress: standing?.progress ?? null,
        item: standing?.item ?? null,
        kept: mine.size,
      },
    ];
  });
}
