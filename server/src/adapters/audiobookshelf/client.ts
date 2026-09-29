/**
 * The Audiobookshelf client. It authenticates with an ABS API key sent as
 * `Authorization: Bearer`, and never reads the environment: `new AbsClient({ baseUrl, token,
 * fetch })`.
 */
import { AdapterError, type FetchLike, requestJson, type RequestInitJson } from '../http/fetch.js';
import { type ZodType, type z } from 'zod';
import {
  closeSessionSchema,
  type FileHeaders,
  fileHeadersSchema,
  type FileRef,
  hlsPlaylistSchema,
  hlsSegmentHeadersSchema,
  inoSchema,
  itemIdSchema,
  itemSchema,
  itemSummarySchema,
  librariesSchema,
  libraryItemsSchema,
  type PlayRequest,
  playSessionSchema,
  statusSchema,
  SUPPORTED_MIME_TYPES,
} from './schemas.js';

/** An audio file's answer: its status, its parsed headers and its body, still streaming. */
export interface UpstreamFile {
  status: 200 | 206;
  headers: FileHeaders;
  body: ReadableStream<Uint8Array>;
}

/** The session an HLS track's `contentUrl` names; null for anything else. */
export function hlsSessionOf(contentUrl: string): string | null {
  const m = /^\/hls\/([^/]+)\/output\.m3u8$/.exec(contentUrl);
  const session = itemIdSchema.safeParse(m?.[1]);
  return session.success ? session.data : null;
}

const FILE_TIMEOUT_MS = 15_000;

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
    return this.call(`api/items/${encodeURIComponent(itemId)}/play`, playSessionSchema, {
      method: 'POST',
      json,
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.call(`api/session/${encodeURIComponent(sessionId)}/close`, closeSessionSchema, {
      method: 'POST',
    });
  }

  /** A transcode's playlist, each segment URI cut to its bare name (see `hlsPlaylistSchema`). */
  getHlsPlaylist(sessionId: string): Promise<string> {
    return this.call(`hls/${encodeURIComponent(sessionId)}/output.m3u8`, hlsPlaylistSchema);
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
   * Opens audio bytes, passing `range` through. Only the answer's headers are waited for
   * (within the timeout) and parsed; the body streams on to the caller, who must read or cancel it.
   */
  private async openStream(
    path: string,
    range: string | undefined,
    schema: ZodType<FileHeaders, z.ZodTypeDef, unknown>,
  ): Promise<UpstreamFile> {
    const url = this.url(path);
    const call = `GET ${new URL(url).pathname}`;
    const headers: Record<string, string> = { authorization: `Bearer ${this.opts.token}` };
    if (range !== undefined) headers.range = range;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FILE_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.opts.fetch(url, { method: 'GET', headers, signal: controller.signal });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new AdapterError('timeout', call, `no answer in ${FILE_TIMEOUT_MS} ms`, undefined, {
          cause,
        });
      }
      throw new AdapterError('network', call, 'the request failed', undefined, { cause });
    } finally {
      clearTimeout(timer);
    }

    const fail = async (error: AdapterError): Promise<never> => {
      await response.body?.cancel();
      throw error;
    };
    if (!response.ok) {
      return fail(new AdapterError('status', call, `answered ${response.status}`, response.status));
    }
    if ((response.status !== 200 && response.status !== 206) || response.body === null) {
      return fail(new AdapterError('parse', call, `answered ${response.status} with no file`));
    }
    const parsed = schema.safeParse(Object.fromEntries(response.headers.entries()));
    if (!parsed.success) {
      return fail(
        new AdapterError('parse', call, parsed.error.message, response.status, {
          cause: parsed.error,
        }),
      );
    }
    return { status: response.status, headers: parsed.data, body: response.body };
  }
}
