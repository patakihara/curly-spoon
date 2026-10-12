/**
 * The Audiobookshelf client. It authenticates with an ABS API key sent as
 * `Authorization: Bearer`, and never reads the environment: `new AbsClient({ baseUrl, token,
 * fetch })`.
 */
import { AdapterError, type FetchLike, requestJson, type RequestInitJson } from '../http/fetch.js';
import {
  type FileHeaders,
  fileHeadersSchema,
  type ImageHeaders,
  imageHeadersSchema,
  openStream,
  type UpstreamFile,
} from '../stream.js';
import { type ZodType, type z } from 'zod';
import {
  type AbsBookmark,
  type AbsMe,
  bookDetailSchema,
  bookmarkSchema,
  type chapterSchema,
  closeSessionSchema,
  deleteBookmarkSchema,
  type FileRef,
  hlsPlaylistSchema,
  hlsSegmentHeadersSchema,
  inoSchema,
  itemIdSchema,
  itemSchema,
  itemSummarySchema,
  librariesSchema,
  MAX_PLAYLIST_BYTES,
  type MediaProgress,
  mediaProgressSchema,
  meSchema,
  libraryItemsSchema,
  type PlayRequest,
  playSessionSchema,
  showNotesSchema,
  type SessionSync,
  statusSchema,
  SUPPORTED_MIME_TYPES,
  syncSessionSchema,
} from './schemas.js';

/** The session an HLS track's `contentUrl` names; null for anything else. */
export function hlsSessionOf(contentUrl: string): string | null {
  const m = /^\/hls\/([^/]+)\/output\.m3u8$/.exec(contentUrl);
  const session = itemIdSchema.safeParse(m?.[1]);
  return session.success ? session.data : null;
}

/** The item and file a direct-play track's `contentUrl` names; null for anything else (HLS). */
export function contentUrlParts(contentUrl: string): FileRef | null {
  const m = /^\/api\/items\/([^/]+)\/file\/([^/]+)$/.exec(contentUrl);
  if (!m) return null;
  const itemId = itemIdSchema.safeParse(m[1]);
  const ino = inoSchema.safeParse(m[2]);
  return itemId.success && ino.success ? { itemId: itemId.data, ino: ino.data } : null;
}

export interface AbsClientOptions {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
}

export class AbsClient {
  constructor(private readonly opts: AbsClientOptions) {}

  private url(path: string, query: Record<string, string> = {}): string {
    const url = new URL(
      path,
      this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`,
    );
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.toString();
  }

  private call<T>(
    path: string,
    schema: ZodType<T>,
    init: RequestInitJson = {},
    query?: Record<string, string>,
  ): Promise<T> {
    return requestJson(
      this.opts.fetch,
      this.url(path, query),
      { ...init, headers: { authorization: `Bearer ${this.opts.token}`, ...init.headers } },
      schema,
    );
  }

  /** The server's version, from the unauthenticated `GET /status`. */
  async getServerVersion(): Promise<string> {
    return (await requestJson(this.opts.fetch, this.url('status'), {}, statusSchema)).serverVersion;
  }

  async getLibraries(): Promise<z.infer<typeof librariesSchema>['libraries']> {
    return (await this.call('api/libraries', librariesSchema)).libraries;
  }

  /**
   * One page of a library, minified, in ABS's own order or by `sort`. The index sorts by
   * `addedAt`, oldest first: a new item lands on the last page, so paging through while items
   * arrive never skips one.
   */
  getLibraryItems(
    libraryId: string,
    page: { limit: number; page: number; sort?: 'addedAt' },
  ): Promise<z.infer<typeof libraryItemsSchema>> {
    const path = `api/libraries/${encodeURIComponent(libraryId)}/items`;
    const query: Record<string, string> = {
      limit: String(page.limit),
      page: String(page.page),
      minified: '1',
    };
    if (page.sort !== undefined) query.sort = page.sort;
    return this.call(path, libraryItemsSchema, {}, query);
  }

  /** A book or a show as the index reads it: `GET /api/items/:id`, not expanded. */
  getItemSummary(itemId: string): Promise<z.infer<typeof itemSummarySchema>> {
    return this.call(`api/items/${encodeURIComponent(itemId)}`, itemSummarySchema);
  }

  /** The same answer, or null when ABS answers 404: the item is gone (recorded). */
  async findItemSummary(itemId: string): Promise<z.infer<typeof itemSummarySchema> | null> {
    try {
      return await this.getItemSummary(itemId);
    } catch (error) {
      if (error instanceof AdapterError && error.status === 404) return null;
      throw error;
    }
  }

  /** A book's title, authors, length in seconds and chapters, from the same answer as `getItem`. */
  async getBookDetail(itemId: string): Promise<{
    title: string;
    authors: string[];
    duration: number;
    chapters: z.infer<typeof chapterSchema>[];
  }> {
    const path = `api/items/${encodeURIComponent(itemId)}`;
    const item = await this.call(path, bookDetailSchema, {}, { expanded: '1' });
    const { metadata, duration, chapters } = item.media;
    return {
      title: metadata.title,
      authors: (metadata.authors ?? []).map((a) => a.name),
      duration,
      chapters: chapters ?? [],
    };
  }

  /** One episode's notes, from its show's answer: null when it has none or the show lists no such episode. */
  async getEpisodeNotes(showId: string, episodeId: string): Promise<string | null> {
    const show = await this.call(`api/items/${encodeURIComponent(showId)}`, showNotesSchema);
    return show.media.episodes.find((e) => e.id === episodeId)?.description ?? null;
  }

  getItem(itemId: string): Promise<z.infer<typeof itemSchema>> {
    return this.call(`api/items/${encodeURIComponent(itemId)}`, itemSchema, {}, { expanded: '1' });
  }

  /**
   * Starts a playback session: direct play when every file is a type the clients play, an HLS
   * transcode otherwise, or always with `forceTranscode`. The body is always explicit; see
   * `SUPPORTED_MIME_TYPES`.
   */
  play(
    itemId: string,
    device: { deviceId: string; clientVersion: string },
    options: { forceTranscode?: boolean } = {},
  ): Promise<z.infer<typeof playSessionSchema>> {
    return this.startPlay(`api/items/${encodeURIComponent(itemId)}/play`, device, options);
  }

  /** Starts a playback session on one episode of a podcast show, as `play` does for a book. */
  playEpisode(
    showId: string,
    episodeId: string,
    device: { deviceId: string; clientVersion: string },
  ): Promise<z.infer<typeof playSessionSchema>> {
    const path = `api/items/${encodeURIComponent(showId)}/play/${encodeURIComponent(episodeId)}`;
    return this.startPlay(path, device, {});
  }

  private startPlay(
    path: string,
    device: { deviceId: string; clientVersion: string },
    options: { forceTranscode?: boolean },
  ): Promise<z.infer<typeof playSessionSchema>> {
    const json: PlayRequest = {
      deviceInfo: {
        clientName: 'Auralis',
        clientVersion: device.clientVersion,
        deviceId: device.deviceId,
      },
      mediaPlayer: 'html5',
      supportedMimeTypes: [...SUPPORTED_MIME_TYPES],
      forceDirectPlay: false,
      forceTranscode: options.forceTranscode ?? false,
    };
    return this.call(path, playSessionSchema, { method: 'POST', json });
  }

  /** Reports where the person is and how long they listened; never retried, as a repeat adds the
   * listening time twice. */
  async syncSession(sessionId: string, sync: SessionSync): Promise<void> {
    await this.call(`api/session/${encodeURIComponent(sessionId)}/sync`, syncSessionSchema, {
      method: 'POST',
      json: sync,
    });
  }

  /** Closes a playback session, with a last report when given: ABS syncs it before closing. */
  async closeSession(sessionId: string, sync?: SessionSync): Promise<void> {
    await this.call(`api/session/${encodeURIComponent(sessionId)}/close`, closeSessionSchema, {
      method: 'POST',
      ...(sync === undefined ? {} : { json: sync }),
    });
  }

  /** The key's own user, their progress and their bookmarks: `GET /api/me`. */
  getMe(): Promise<AbsMe> {
    return this.call('api/me', meSchema);
  }

  /** The person's progress on one item, or null when they have none (ABS answers 404). */
  async findMyProgress(itemId: string): Promise<MediaProgress | null> {
    try {
      return await this.call(`api/me/progress/${encodeURIComponent(itemId)}`, mediaProgressSchema);
    } catch (error) {
      if (error instanceof AdapterError && error.status === 404) return null;
      throw error;
    }
  }

  /** The person's progress on one episode of a show, or null when they have none. */
  async findMyEpisodeProgress(itemId: string, episodeId: string): Promise<MediaProgress | null> {
    const path = `api/me/progress/${encodeURIComponent(itemId)}/${encodeURIComponent(episodeId)}`;
    try {
      return await this.call(path, mediaProgressSchema);
    } catch (error) {
      if (error instanceof AdapterError && error.status === 404) return null;
      throw error;
    }
  }

  /** Makes a bookmark on a library item, at whole seconds `time`. */
  createBookmark(itemId: string, bookmark: { time: number; title: string }): Promise<AbsBookmark> {
    return this.call(`api/me/item/${encodeURIComponent(itemId)}/bookmark`, bookmarkSchema, {
      method: 'POST',
      json: bookmark,
    });
  }

  /** Deletes the bookmark at `time` on a library item. */
  async deleteBookmark(itemId: string, time: number): Promise<void> {
    const path = `api/me/item/${encodeURIComponent(itemId)}/bookmark/${encodeURIComponent(String(time))}`;
    await this.call(path, deleteBookmarkSchema, { method: 'DELETE' });
  }

  /** A transcode's playlist, each segment URI cut to its bare name (see `hlsPlaylistSchema`). */
  getHlsPlaylist(sessionId: string): Promise<string> {
    return this.call(`hls/${encodeURIComponent(sessionId)}/output.m3u8`, hlsPlaylistSchema, {
      maxBytes: MAX_PLAYLIST_BYTES,
    });
  }

  /** Opens one audio file, passing `range` through; see `openStream`. */
  openFile(file: FileRef, range?: string): Promise<UpstreamFile> {
    const path = `api/items/${encodeURIComponent(file.itemId)}/file/${encodeURIComponent(file.ino)}`;
    return this.openStream(path, range, fileHeadersSchema);
  }

  /** Opens one segment of a transcode, passing `range` through; see `openStream`. */
  openHlsSegment(sessionId: string, file: string, range?: string): Promise<UpstreamFile> {
    const path = `hls/${encodeURIComponent(sessionId)}/${encodeURIComponent(file)}`;
    return this.openStream(path, range, hlsSegmentHeadersSchema);
  }

  /**
   * An item's cover image, as ABS serves it to its own apps (WebP, recorded), or scaled by ABS to
   * `width` pixels wide.
   */
  openCover(itemId: string, width?: number): Promise<UpstreamFile<ImageHeaders>> {
    const path = `api/items/${encodeURIComponent(itemId)}/cover`;
    const query: Record<string, string> = width === undefined ? {} : { width: String(width) };
    const headers = { authorization: `Bearer ${this.opts.token}` };
    const url = this.url(path, query);
    return openStream(this.opts.fetch, url, headers, undefined, imageHeadersSchema);
  }

  /** Opens audio bytes with this person's key, passing `range` through. */
  private openStream(
    path: string,
    range: string | undefined,
    schema: ZodType<FileHeaders, z.ZodTypeDef, unknown>,
  ): Promise<UpstreamFile> {
    const headers = { authorization: `Bearer ${this.opts.token}` };
    return openStream(this.opts.fetch, this.url(path), headers, range, schema);
  }
}
