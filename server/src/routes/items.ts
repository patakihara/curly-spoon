/**
 * One book, show or album opened, and its art. Each is one the index holds at the top level, in a
 * library the signed-in person may open, as their own upstream says (the same check as the
 * library lists); anything else, an episode or a track included, answers 404 before any image or
 * detail is asked for.
 *
 * - A book's page: its header, its length and its chapters from its own expanded answer.
 * - A show's page: its episodes in the show's order as the index holds it, each with how far
 *   through the person is and whether they finished it, from their `GET /api/me`.
 * - An album's page: its tracks as the index holds them, in disc and track order.
 * - Art: the Audiobookshelf cover or the Jellyfin primary image, asked for with the person's own
 *   token and passed on as it streams, at the size asked for. The client only ever sees this
 *   server's own `/api/media/{ref}/art`; it is kept a day, private to the person.
 */
import {
  type ArtSize,
  getItem,
  type ItemDetail,
  type ItemEpisode,
  type ItemTrack,
  mediaArt,
  parseMediaRefKey,
  type PlaybackChapter,
} from '@auralis/schema';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ImageHeaders, UpstreamFile } from '../adapters/stream.js';
import { albumTracks, episodesInOrder, indexedRow, type StoredRow } from '../libraryIndex/store.js';
import { Refusal, serve, serveStream, type StreamAnswer } from '../route.js';
import type { Db } from '../store/connection.js';
import { type Upstreams, upstreamFor } from '../upstream/links.js';
import { PAGE_KINDS } from './art.js';
import { signedIn } from './auth.js';
import { type AbsAccess, absAccess, entry, jellyfinViews } from './library.js';
import { refusalFor, type UpstreamAccess } from './play.js';

/** Pixel widths the art route asks the upstream for, by size. */
export const ART_WIDTH: Record<ArtSize, number> = { small: 192, medium: 512, large: 1024 };

/** How art is cached: a day, by the person's own client only, since who may see it is checked. */
const ART_CACHE = 'private, max-age=86400';

/** A book, show or album the person may open, with what was learned checking. */
type Openable =
  | { row: StoredRow; kind: 'book' | 'show'; abs: NonNullable<Upstreams['abs']>; access: AbsAccess }
  | { row: StoredRow; kind: 'album'; jellyfin: NonNullable<Upstreams['jellyfin']> };

const notFound = () => new Refusal(404, 'not_found');

/** Who an album's track names under its title: its own artists. */
function trackSub(row: StoredRow): string | null {
  const names = row.creators.filter((c) => c.role === 'artist').map((c) => c.name);
  return names.length > 0 ? names.join(', ') : null;
}

/** A book's chapters at their places in the whole book, in order, cut to its length. */
function bookChapters(
  chapters: { title: string; start: number; end: number }[],
  length: number,
): PlaybackChapter[] {
  return chapters
    .map(({ title, start, end }) => ({
      title,
      start: Math.min(Math.max(start, 0), length),
      end: Math.min(Math.max(end, 0), length),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);
}

function episodes(db: Db, show: StoredRow, access: AbsAccess): ItemEpisode[] {
  return episodesInOrder(db, show.id).map((row) => {
    const { progress, finished } = access.standing(row.id);
    return {
      ref: { source: 'abs', id: row.id },
      title: row.title,
      description: null,
      publishedAt: row.publishedAt,
      duration: row.duration,
      progress,
      finished,
    };
  });
}

function tracks(db: Db, album: StoredRow): ItemTrack[] {
  return albumTracks(db, album.id).map((row) => ({
    ref: { source: 'jellyfin', id: row.id },
    number: row.position !== null && row.position > 0 ? row.position : null,
    title: row.title,
    sub: trackSub(row),
    duration: row.duration,
  }));
}

/** The headers art is passed on with: the image's own, and this server's caching. */
function artAnswer(opened: UpstreamFile<ImageHeaders>): StreamAnswer {
  const { 'content-type': type, 'content-length': length, etag } = opened.headers;
  const lastModified = opened.headers['last-modified'];
  return {
    status: 200,
    headers: {
      'content-type': type,
      'cache-control': ART_CACHE,
      ...(length === undefined ? {} : { 'content-length': length }),
      ...(etag === undefined ? {} : { etag }),
      ...(lastModified === undefined ? {} : { 'last-modified': lastModified }),
    },
    body: opened.body,
  };
}

export function itemRoutes(
  app: FastifyInstance,
  options: { db: Db; upstreams: UpstreamAccess | null },
): void {
  const { db, upstreams } = options;

  /** The book, show or album `key` names, if the person may open it; else 404. */
  const openable = async (request: FastifyRequest, key: string): Promise<Openable> => {
    const user = signedIn(request);
    const ref = parseMediaRefKey(key);
    const row = ref === null ? undefined : indexedRow(db, ref.source, ref.id);
    if (row === undefined || row.parentId !== null || !PAGE_KINDS.includes(row.kind)) {
      throw notFound();
    }
    const clients =
      upstreams === null ? { abs: null, jellyfin: null } : upstreamFor({ db, ...upstreams }, user);
    try {
      if (row.kind === 'album') {
        if (clients.jellyfin === null) throw notFound();
        const views = await jellyfinViews(clients.jellyfin);
        if (row.libraryId === null || !views.has(row.libraryId)) throw notFound();
        return { row, kind: 'album', jellyfin: clients.jellyfin };
      }
      if (clients.abs === null) throw notFound();
      const access = await absAccess(clients.abs);
      if (!access.open(row.libraryId)) throw notFound();
      return { row, kind: row.kind as 'book' | 'show', abs: clients.abs, access };
    } catch (error) {
      if (error instanceof Refusal) throw error;
      return refusalFor(error);
    }
  };

  serve(app, getItem, async (request, _reply, _body, { params }): Promise<ItemDetail> => {
    const item = await openable(request, params.ref);
    const { row } = item;
    const none = { chapters: [], episodes: [], tracks: [] };
    if (item.kind === 'album') {
      return {
        ...entry(row, 'album', null),
        duration: row.duration,
        ...none,
        tracks: tracks(db, row),
      };
    }
    if (item.kind === 'show') {
      const list = episodes(db, row, item.access);
      return { ...entry(row, 'show', null), duration: null, ...none, episodes: list };
    }
    const detail = await item.abs.getBookDetail(row.id).catch(refusalFor);
    return {
      ...entry(row, 'book', item.access.standing(row.id).progress),
      duration: detail.duration,
      ...none,
      chapters: bookChapters(detail.chapters, detail.duration),
    };
  });

  serveStream(app, mediaArt, async (request, { params, query }) => {
    const item = await openable(request, params.ref);
    const width = query.size === undefined ? undefined : ART_WIDTH[query.size];
    const opened =
      item.kind === 'album'
        ? item.jellyfin.openImage(item.row.id, width)
        : item.abs.openCover(item.row.id, width);
    return artAnswer(await opened.catch(refusalFor));
  });
}
