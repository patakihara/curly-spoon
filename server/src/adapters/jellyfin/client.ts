/**
 * The Jellyfin client: the calls the recorder records and the index reads, and the lookups that
 * find their ids. Every request carries the
 * `MediaBrowser` authorization header (see `auth.ts`) with the API key as `Token`, and never
 * reads the environment: `new JellyfinClient({ baseUrl, token, fetch })`.
 */
import { type z, type ZodType } from 'zod';
import { type FetchLike, requestJson } from '../http/fetch.js';
import { buildAuthorizationHeader, type JellyfinDeviceInfo } from './auth.js';
import {
  baseItemDtoSchema,
  baseItemQueryResultSchema,
  type IndexItem,
  type IndexQueryResult,
  indexQueryResultSchema,
  publicSystemInfoSchema,
  userListSchema,
} from './schemas.js';

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

/** The fields the index reads beyond the defaults: external ids, genres and the change tag. */
const INDEX_FIELDS = 'ProviderIds,Genres,Etag';

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

  /**
   * One page of albums from every library, oldest added first, so a new album lands on the last
   * page. `Etag` moves when Jellyfin saves the album again, which is what the index compares.
   */
  getAlbums(page: { limit: number; startIndex: number }): Promise<IndexQueryResult> {
    return this.get('Items', indexQueryResultSchema, {
      IncludeItemTypes: 'MusicAlbum',
      Recursive: 'true',
      SortBy: 'DateCreated,SortName',
      SortOrder: 'Ascending',
      StartIndex: String(page.startIndex),
      Limit: String(page.limit),
      Fields: INDEX_FIELDS,
    });
  }

  /**
   * One album by id, or undefined when Jellyfin no longer has it: `GET /Items?Ids=` answers an
   * empty list for an unknown id (recorded), and needs no user, unlike `GET /Items/{id}`.
   */
  async findAlbum(albumId: string): Promise<IndexItem | undefined> {
    const query = {
      Ids: albumId,
      IncludeItemTypes: 'MusicAlbum',
      Recursive: 'true',
      Fields: INDEX_FIELDS,
    };
    return (await this.get('Items', indexQueryResultSchema, query)).Items[0];
  }

  /** Every track of one album, in disc and track order. */
  async getAlbumTracks(albumId: string): Promise<IndexItem[]> {
    const query = {
      ParentId: albumId,
      IncludeItemTypes: 'Audio',
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      Fields: INDEX_FIELDS,
    };
    return (await this.get('Items', indexQueryResultSchema, query)).Items;
  }

  /** The first administrator's id: `GET /Users`, which only an admin token may call. */
  async findAdministratorId(): Promise<string | undefined> {
    const users = await this.get('Users', userListSchema);
    return users.find((u) => u.Policy.IsAdministrator)?.Id;
  }

  /**
   * One item: `GET /Items/{id}`. A person's token carries its user; an API key has none, and
   * Jellyfin 10.11 answers 400 unless `userId` names one (checked live).
   */
  getItem(itemId: string, userId?: string): Promise<BaseItemDto> {
    const query = userId === undefined ? undefined : { userId };
    return this.get(`Items/${encodeURIComponent(itemId)}`, baseItemDtoSchema, query);
  }
}
