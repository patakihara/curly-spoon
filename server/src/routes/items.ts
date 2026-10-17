/**
 * One book, show, episode or album opened, and a book's, show's or album's art. Each is one the
 * index holds, in a library the signed-in person may open, as their own upstream says (the same
 * check as the library lists): a book, show or album at the top level, or an episode under its
 * show. Anything else, a track included, answers 404 before any image or detail is asked for.
 *
 * - A book's page: its header, its length and its chapters from its own expanded answer.
 * - A show's page: its episodes in the show's order as the index holds it, each with how far
 *   through the person is and whether they finished it, from their `GET /api/me`.
 * - An album's page: its tracks as the index holds them, in disc and track order.
 * - An episode's page: its show's title and art, its length and published date as the index
 *   holds them, how far through the person is and whether they finished it, from their
 *   `GET /api/me`, and its notes from its show's own answer.
 * - Art: the Audiobookshelf cover or the Jellyfin primary image, asked for with the person's own
 *   token and passed on as it streams, at the size asked for. The client only ever sees this
 *   server's own `/api/media/{ref}/art`; it is kept a day, private to the person. Who may see
 *   art is checked once a minute per person, so a grid of covers costs one lookup of each
 *   upstream; a page always checks afresh, since it shows how far through the person is.
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
import { accessCache } from './accessCache.js';
import { PAGE_KINDS } from './art.js';
import { signedIn } from './auth.js';
import { type AbsAccess, absAccess, entry, jellyfinViews } from './library.js';
import { refusalFor, type UpstreamAccess } from './play.js';

/** Pixel widths the art route asks the upstream for, by size. */
export const ART_WIDTH: Record<ArtSize, number> = { small: 192, medium: 512, large: 1024 };

/** How art is cached: a day, by the person's own client only, since who may see it is checked. */
const ART_CACHE = 'private, max-age=86400';

type Abs = NonNullable<Upstreams['abs']>;

/** A book, show, episode or album the person may open, with what was learned checking. */
type Openable =
  | { row: StoredRow; kind: 'book' | 'show'; abs: Abs; access: AbsAccess }
  | { row: StoredRow; kind: 'episode'; show: StoredRow; abs: Abs; access: AbsAccess }
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
  const artAccess = accessCache();

  /**
   * The book, show or album `key` names, or for a page an episode, if the person may open it; else
   * 404. `forArt` takes the person's access from the last minute's check, where there is one, and
   * opens no episode: an episode's art is its show's.
   */
  const openable = async (
    request: FastifyRequest,
    key: string,
    forArt = false,
  ): Promise<Openable> => {
    const user = signedIn(request);
    const ref = parseMediaRefKey(key);
    const row = ref === null ? undefined : indexedRow(db, ref.source, ref.id);
    const show =
      !forArt && row?.kind === 'episode' && row.parentId !== null
        ? indexedRow(db, row.source, row.parentId)
        : undefined;
    const topLevel = row?.parentId === null && PAGE_KINDS.includes(row.kind);
    if (row === undefined || !(topLevel || show?.kind === 'show')) throw notFound();
    const clients =
      upstreams === null ? { abs: null, jellyfin: null } : upstreamFor({ db, ...upstreams }, user);
    try {
      if (row.kind === 'album') {
        if (clients.jellyfin === null) throw notFound();
        const jellyfin = clients.jellyfin;
        const views = forArt
          ? await artAccess(`${user.id}:jellyfin`, () => jellyfinViews(jellyfin))
          : await jellyfinViews(jellyfin);
        if (row.libraryId === null || !views.has(row.libraryId)) throw notFound();
        return { row, kind: 'album', jellyfin: clients.jellyfin };
      }
      if (clients.abs === null) throw notFound();
      const abs = clients.abs;
      const access = forArt
        ? await artAccess(`${user.id}:abs`, () => absAccess(abs))
        : await absAccess(abs);
      if (show !== undefined) {
        if (!access.open(show.libraryId)) throw notFound();
        return { row, kind: 'episode', show, abs, access };
      }
      if (!access.open(row.libraryId)) throw notFound();
      return { row, kind: row.kind as 'book' | 'show', abs, access };
    } catch (error) {
      if (error instanceof Refusal) throw error;
      return refusalFor(error);
    }
  };

  /** An episode's page: headed by its show, as the show's page heads it, with its own standing. */
  const episodePage = async ({
    row,
    show,
    abs,
    access,
  }: Extract<Openable, { kind: 'episode' }>): Promise<ItemDetail> => {
    const description = await abs.getEpisodeNotes(show.id, row.id).catch(refusalFor);
    const { progress, finished } = access.standing(row.id);
    const head = entry(show, 'show', progress);
    return {
      ...head,
      ref: { source: 'abs', id: row.id },
      kind: 'episode',
      title: row.title,
      sub: show.title,
      duration: row.duration,
      chapters: [],
      episodes: [],
      tracks: [],
      episode: { show: head.ref, description, publishedAt: row.publishedAt, finished },
    };
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
    if (item.kind === 'episode') return episodePage(item);
    const detail = await item.abs.getBookDetail(row.id).catch(refusalFor);
    return {
      ...entry(row, 'book', item.access.standing(row.id).progress),
      duration: detail.duration,
      ...none,
      chapters: bookChapters(detail.chapters, detail.duration),
    };
  });

  serveStream(app, mediaArt, async (request, { params, query }) => {
    const item = await openable(request, params.ref, true);
    const width = query.size === undefined ? undefined : ART_WIDTH[query.size];
    const opened =
      item.kind === 'album'
        ? item.jellyfin.openImage(item.row.id, width)
        : item.abs.openCover(item.row.id, width);
    return artAnswer(await opened.catch(refusalFor));
  });
}
