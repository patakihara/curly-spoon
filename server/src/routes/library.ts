/**
 * The signed-in person's library lists: their books, podcast shows or albums, from the whole
 * household's index. Theirs means what they requested, added, subscribed to or played: the claims
 * in the store, what their own Audiobookshelf says they have begun or finished (a show once any
 * episode is), and the albums of what their own Jellyfin says they have played. With the
 * `showEveryonesLibrary` setting, it means everything indexed. Their requests still on the way sit
 * beside the list, with their status. A list comes by title, by author, host or artist, or shuffled
 * by a seed (`../library/sort.ts`); Random asked without a seed draws one and answers it, so the
 * same order can be asked for again.
 *
 * What the upstreams say is read with the person's own token, at most once a minute, and saved as
 * played claims. So a failed read costs only what it would have added: the list still answers, from
 * the claims, which hold all that earlier reads found; a book's progress is left out until a read
 * comes back; what Auralis holds for a household play shows all the same. An entry links art only when its upstream has art for it, as the index read.
 */
import { randomInt } from 'node:crypto';
import {
  type LibraryEntry,
  type LibraryEntryKind,
  type LibraryMedium,
  LIBRARY_SEED_MAX,
  listLibrary,
  type MediaRef,
  mediaRefKey,
  type RequestedEntry,
  type RequestMedium,
} from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import type { AbsClient } from '../adapters/audiobookshelf/client.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import { sortEntries } from '../library/sort.js';
import type { Creator } from '../libraryIndex/rows.js';
import { personalRows } from '../library/personal.js';
import { indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { serve } from '../route.js';
import { artUrl } from './art.js';
import { addPlayedClaims } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import { requestsOf, type StoredRequest } from '../store/requests.js';
import { readSettings } from '../store/settings.js';
import { upstreamFor } from '../upstream/links.js';
import { absAccess, type AbsAccess, withHeld } from '../upstream/reach.js';
import { accessCache } from './accessCache.js';
import { signedIn } from './auth.js';
import { type UpstreamAccess } from './play.js';

/** Who a list names under each title: a book's authors, a show's host, an album's artists. */
const SUB_ROLE: Record<LibraryEntryKind, Creator['role']> = {
  book: 'author',
  show: 'host',
  album: 'album-artist',
};

/** A list's entry for an indexed book, show or album: also the head of its page. */
export function entry(
  row: StoredRow,
  kind: LibraryEntryKind,
  progress: number | null,
): LibraryEntry {
  const ref: MediaRef = { source: row.source, id: row.id };
  const names = row.creators.filter((c) => c.role === SUB_ROLE[kind]).map((c) => c.name);
  return {
    ref,
    kind,
    title: row.title,
    sub: names.length > 0 ? names.join(', ') : null,
    art: row.hasArt ? artUrl(ref) : null,
    progress,
    availability: { kind: 'owned' },
  };
}

/** How many played tracks one read of Jellyfin asks for. */
const PLAYED_PAGE_SIZE = 200;

/** The albums of every track the person has played on Jellyfin, read a page at a time. */
async function playedAlbums(jellyfin: JellyfinClient, pageSize: number): Promise<string[]> {
  const albums = new Set<string>();
  for (let startIndex = 0; ;) {
    const { tracks, total } = await jellyfin.getPlayedTracks({ limit: pageSize, startIndex });
    for (const { albumId } of tracks) if (albumId !== null) albums.add(albumId);
    startIndex += tracks.length;
    if (tracks.length === 0 || startIndex >= total) return [...albums];
  }
}

/** What each list holds, and which requests wait to land in it. */
const LISTS: Record<LibraryMedium, { kind: LibraryEntryKind; requests: RequestMedium[] }> = {
  books: { kind: 'book', requests: ['book'] },
  podcasts: { kind: 'show', requests: ['podcast'] },
  music: { kind: 'album', requests: ['album', 'song'] },
};

/** A request on its way, as it shows beside the list. */
function requestedEntry(db: Db, request: StoredRequest, kind: LibraryEntryKind): RequestedEntry {
  const { result, state, target } = request;
  const indexed = result === null ? undefined : indexedRow(db, result.source, result.id);
  return {
    id: request.id,
    kind,
    title: target.title,
    sub: target.creator,
    art: result !== null && indexed?.hasArt === true ? artUrl(result) : null,
    availability: {
      kind: 'requested',
      status: state.status,
      ...(state.status === 'downloading' ? { progress: state.progress } : {}),
    },
  };
}

export function libraryRoutes(
  app: FastifyInstance,
  options: {
    db: Db;
    upstreams: UpstreamAccess | null;
    log: { warn: (details: Record<string, unknown>, message: string) => void };
    now: () => number;
    playedPageSize?: number;
  },
): void {
  const { db, upstreams, log, now } = options;
  const pageSize = options.playedPageSize ?? PLAYED_PAGE_SIZE;
  const reads = accessCache();

  /** A read of what a person's upstream says, or null if it failed, which costs their list nothing. */
  const reading = async <T>(userId: string, upstream: string, read: () => Promise<T>) => {
    try {
      return await reads(`${userId}:${upstream}`, read);
    } catch (err) {
      log.warn({ user: userId, upstream, err }, 'library read failed; listing from claims');
      return null;
    }
  };

  /** The person's Audiobookshelf: how far through each book they are, and what they have begun. */
  const readAbs = (userId: string, abs: AbsClient) =>
    reading(userId, 'abs', async () => {
      const access = await absAccess(abs);
      const begun = access.begun.map((id): MediaRef => ({ source: 'abs', id }));
      addPlayedClaims(db, userId, begun, now());
      return access;
    });

  /** The albums the person has played on Jellyfin. */
  const readJellyfin = (userId: string, jellyfin: JellyfinClient) =>
    reading(userId, 'jellyfin', async () => {
      const played = await playedAlbums(jellyfin, pageSize);
      const albums = played.map((id): MediaRef => ({ source: 'jellyfin', id }));
      addPlayedClaims(db, userId, albums, now());
    });

  serve(app, listLibrary, async (request, _reply, _body, { params, query }) => {
    const user = signedIn(request);
    const { kind, requests } = LISTS[params.medium];
    const { showEveryonesLibrary: everyone } = readSettings(db, user.id);
    const household = upstreams?.household?.abs != null;
    const clients =
      upstreams === null ? { abs: null, jellyfin: null } : upstreamFor({ db, ...upstreams }, user);

    let own: AbsAccess | null = null;
    if (kind !== 'album' && clients.abs !== null) {
      own = await readAbs(user.id, clients.abs);
    } else if (kind === 'album' && !everyone && clients.jellyfin !== null) {
      await readJellyfin(user.id, clients.jellyfin);
    }

    const access = withHeld(db, user.id, own, household);
    const items = personalRows(db, user.id, kind).map((row) =>
      entry(row, kind, kind === 'book' ? (access?.standing(row.id).progress ?? null) : null),
    );

    const listed = new Set(items.map(({ ref }) => mediaRefKey(ref)));
    const requested = requestsOf(db, user.id, app.log)
      .filter(
        (one) =>
          requests.includes(one.medium) &&
          one.state.status !== 'inLibrary' &&
          (one.result === null || !listed.has(mediaRefKey(one.result))),
      )
      .map((one) => requestedEntry(db, one, kind));

    const seed =
      query.sort === 'random' ? (query.seed ?? randomInt(0, LIBRARY_SEED_MAX + 1)) : null;
    return { items: sortEntries(items, query.sort, seed), requested, sort: query.sort, seed };
  });
}
