/**
 * The Jellyfin client: the two calls M0.record records. Every request carries the
 * `MediaBrowser` authorization header (see `auth.ts`) with the API key as `Token`, and never
 * reads the environment: `new JellyfinClient({ baseUrl, token, fetch })`.
 */
import { type z, type ZodType } from 'zod';
import { type FetchLike, requestJson } from '../http/fetch.js';
import { buildAuthorizationHeader, type JellyfinDeviceInfo } from './auth.js';
import { baseItemDtoSchema, baseItemQueryResultSchema, publicSystemInfoSchema } from './schemas.js';

export interface JellyfinClientOptions {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
  device?: JellyfinDeviceInfo;
}

const SERVER_DEVICE: JellyfinDeviceInfo = {
  client: 'Auralis',
  device: 'Auralis server',
  deviceId: 'auralis-server',
  version: '0.0.0',
};

type BaseItemDto = z.infer<typeof baseItemDtoSchema>;

export class JellyfinClient {
  private readonly device: JellyfinDeviceInfo;

  constructor(private readonly opts: JellyfinClientOptions) {
    this.device = opts.device ?? SERVER_DEVICE;
  }

  private url(path: string, query: Record<string, string> = {}): string {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.toString();
  }

  private get<T>(path: string, schema: ZodType<T>, query?: Record<string, string>, token = true) {
    const authorization = buildAuthorizationHeader(
      this.device,
      token ? this.opts.token : undefined,
    );
    return requestJson(
      this.opts.fetch,
      this.url(path, query),
      { headers: { authorization } },
      schema,
    );
  }

  /** The server's version, from the unauthenticated `GET /System/Info/Public`. */
  async getServerVersion(): Promise<string> {
    return (await this.get('System/Info/Public', publicSystemInfoSchema, undefined, false)).Version;
  }

  /** The top-level libraries: `GET /Library/MediaFolders`. */
  async getLibraries(): Promise<BaseItemDto[]> {
    return (await this.get('Library/MediaFolders', baseItemQueryResultSchema)).Items;
  }

  /** Up to `limit` albums from anywhere in the libraries. */
  async findAlbums(limit: number): Promise<BaseItemDto[]> {
    const query = { IncludeItemTypes: 'MusicAlbum', Recursive: 'true', Limit: String(limit) };
    return (await this.get('Items', baseItemQueryResultSchema, query)).Items;
  }

  getItem(itemId: string): Promise<BaseItemDto> {
    return this.get(`Items/${encodeURIComponent(itemId)}`, baseItemDtoSchema);
  }
}
