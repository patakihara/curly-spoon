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
 * comes back. An entry links art only when its upstream has art for it, as the index read.
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
import { libraryAccessSchema } from '../adapters/audiobookshelf/schemas.js';
import type { JellyfinClient } from '../adapters/jellyfin/client.js';
import { sortEntries } from '../library/sort.js';
import type { Creator } from '../libraryIndex/rows.js';
import { indexedRow, type StoredRow, topLevelOfKind } from '../libraryIndex/store.js';
import { Refusal, serve } from '../route.js';
import { artUrl } from './art.js';
import { addPlayedClaims, claimsOf } from '../store/claims.js';
import type { Db } from '../store/connection.js';
import { requestsOf, type StoredRequest } from '../store/requests.js';
import { readSettings } from '../store/settings.js';
import { upstreamFor } from '../upstream/links.js';
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

/** Where a person stands with one book or episode: how far through, and whether finished. */
export interface Standing {
  /** From 0 to 1; null when not started, or begun but still at 0. Finished is 1. */
  progress: number | null;
  finished: boolean;
  /** When Audiobookshelf last changed it, in milliseconds since the epoch; null if never. */
  updatedAt: number | null;
}

/** A book or episode the person has begun or finished on Audiobookshelf. */
export interface Heard {
  /** The book's id, or the episode's own id. */
  id: string;
  /** When Audiobookshelf last changed it, in milliseconds since the epoch; null if never. */
  updatedAt: number | null;
}

/** What the person's own Audiobookshelf `GET /api/me` says: what they may open, how far they are. */
export interface AbsAccess {
  open(libraryId: string | null): boolean;
  /** A book's standing by its id, or an episode's by its own id. */
  standing(id: string): Standing;
  /**
   * Every book and episode begun, by time or share, or finished, that the person has not removed
   * from Continue Listening.
   */
  heard: readonly Heard[];
  /**
   * The books and shows they have begun or finished any of, removed from Continue Listening or not:
   * removing it from there does not take it out of their library.
   */
  begun: readonly string[];
  /** Whether the person removed a book or episode from Continue Listening, by its id. */
  hidden(id: string): boolean;
  /** Whether the person removed a series from Continue Series, by its id. */
  seriesHidden(seriesId: string): boolean;
}

export async function absAccess(abs: AbsClient): Promise<AbsAccess> {
  const me = await abs.getMe();
  const access = libraryAccessSchema.safeParse(me);
  if (!access.success) throw new Refusal(502, 'upstream_failed');
  const { permissions, librariesAccessible } = access.data;
  const standings = new Map<string, Standing>(
    me.mediaProgress.map((p) => {
      const share = p.isFinished ? 1 : Math.min(1, p.progress);
      return [
        p.episodeId ?? p.libraryItemId,
        {
          progress: share > 0 ? share : null,
          finished: p.isFinished,
          updatedAt: p.lastUpdate ?? null,
        },
      ];
    }),
  );
  const hiddenIds = new Set(
    me.mediaProgress
      .filter((p) => p.hideFromContinueListening === true)
      .map((p) => p.episodeId ?? p.libraryItemId),
  );
  const hiddenSeries = new Set(me.seriesHideFromContinueListening ?? []);
  const begun = me.mediaProgress.filter((p) => p.isFinished || p.progress > 0 || p.currentTime > 0);
  return {
    open: (libraryId) =>
      permissions.accessAllLibraries ||
      (libraryId !== null && librariesAccessible.includes(libraryId)),
    standing: (id) => standings.get(id) ?? { progress: null, finished: false, updatedAt: null },
    heard: begun
      .filter((p) => p.hideFromContinueListening !== true)
      .map((p) => ({ id: p.episodeId ?? p.libraryItemId, updatedAt: p.lastUpdate ?? null })),
    begun: [...new Set(begun.map((p) => p.libraryItemId))],
    hidden: (id) => hiddenIds.has(id),
    seriesHidden: (seriesId) => hiddenSeries.has(seriesId),
  };
}

/** The ids of the Jellyfin libraries the person sees, hidden from their home screen or not. */
export async function jellyfinViews(jellyfin: JellyfinClient): Promise<Set<string>> {
  return new Set((await jellyfin.getUserViews()).map((view) => view.Id));
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
    const clients =
      upstreams === null ? { abs: null, jellyfin: null } : upstreamFor({ db, ...upstreams }, user);

    let access: AbsAccess | null = null;
    if (kind !== 'album' && clients.abs !== null) {
      access = await readAbs(user.id, clients.abs);
    } else if (kind === 'album' && !everyone && clients.jellyfin !== null) {
      await readJellyfin(user.id, clients.jellyfin);
    }

    const mine = new Set(claimsOf(db, user.id).map(({ ref }) => mediaRefKey(ref)));
    const rows = topLevelOfKind(db, kind).filter(
      (row) => everyone || mine.has(mediaRefKey({ source: row.source, id: row.id })),
    );
    const items = rows.map((row) =>
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
