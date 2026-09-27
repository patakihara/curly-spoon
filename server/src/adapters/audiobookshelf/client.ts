/**
 * The Audiobookshelf client. It authenticates with an ABS API key sent as
 * `Authorization: Bearer`, and never reads the environment: `new AbsClient({ baseUrl, token,
 * fetch })`.
 */
import { type FetchLike, requestJson, type RequestInitJson } from '../http/fetch.js';
import { type ZodType, type z } from 'zod';
import {
  closeSessionSchema,
  itemSchema,
  librariesSchema,
  libraryItemsSchema,
  type PlayRequest,
  playSessionSchema,
  statusSchema,
  SUPPORTED_MIME_TYPES,
} from './schemas.js';

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

  async getLibraryItems(
    libraryId: string,
    limit: number,
  ): Promise<z.infer<typeof libraryItemsSchema>['results']> {
    const path = `api/libraries/${encodeURIComponent(libraryId)}/items`;
    return (await this.call(path, libraryItemsSchema, {}, { limit: String(limit) })).results;
  }

  getItem(itemId: string): Promise<z.infer<typeof itemSchema>> {
    return this.call(`api/items/${encodeURIComponent(itemId)}`, itemSchema, {}, { expanded: '1' });
  }

  /** Starts a direct-play session. The body is always explicit; see `SUPPORTED_MIME_TYPES`. */
  play(
    itemId: string,
    device: { deviceId: string; clientVersion: string },
  ): Promise<z.infer<typeof playSessionSchema>> {
    const json: PlayRequest = {
      deviceInfo: {
        clientName: 'Auralis',
        clientVersion: device.clientVersion,
        deviceId: device.deviceId,
      },
      mediaPlayer: 'html5',
      supportedMimeTypes: [...SUPPORTED_MIME_TYPES],
      forceDirectPlay: true,
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
}
