/**
 * The Jellyfin client: the calls the recorder records, the index reads and playing makes, and the
 * lookups that find their ids. Every request carries the
 * `MediaBrowser` authorization header (see `auth.ts`) with the API key as `Token`, and never
 * reads the environment: `new JellyfinClient({ baseUrl, token, fetch })`.
 */
import { type z, type ZodType } from 'zod';
import { type FetchLike, requestJson } from '../http/fetch.js';
import {
  fileHeadersSchema,
  type ImageHeaders,
  imageHeadersSchema,
  openStream,
  type UpstreamFile,
} from '../stream.js';
import { buildAuthorizationHeader, type JellyfinDeviceInfo } from './auth.js';
import {
  baseItemDtoSchema,
  baseItemQueryResultSchema,
  type IndexItem,
  type IndexQueryResult,
  indexQueryResultSchema,
  noContentSchema,
  type PlayableItem,
  playableItemSchema,
  playableQueryResultSchema,
  publicSystemInfoSchema,
  type UserItemData,
  userItemDataSchema,
  userListSchema,
} from './schemas.js';

/** How many tracks autoplay's radio asks Instant Mix for, and the recording records. */
export const INSTANT_MIX_LIMIT = 20;

/** Jellyfin counts time in 100 ns ticks. */
export const TICKS_PER_SECOND = 10_000_000;

/** One report of a track playing: where it is, in seconds, and whether it is paused. */
export interface PlaybackReport {
  itemId: string;
  position: number;
  paused: boolean;
  /** The play this report belongs to; Jellyfin ties a start, its progress and its stop by it. */
  playSessionId: string;
}

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

  private post<T>(path: string, json: unknown, schema: ZodType<T>) {
    const authorization = buildAuthorizationHeader(this.device, this.opts.token);
    return requestJson(
      this.opts.fetch,
      this.url(path),
      { method: 'POST', headers: { authorization }, json },
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
   * One page of albums, from every library or from the one `parentId` names, oldest added first,
   * so a new album lands on the last page. `Etag` moves when Jellyfin saves the album again,
   * which is what the index compares.
   */
  getAlbums(page: {
    limit: number;
    startIndex: number;
    parentId?: string;
  }): Promise<IndexQueryResult> {
    return this.get('Items', indexQueryResultSchema, {
      ...(page.parentId === undefined ? {} : { ParentId: page.parentId }),
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

  /**
   * The libraries the token's own user may see, with those they hid from their home screen:
   * `GET /UserViews?includeHidden=true`. A view's `Id` is its library's `Library/MediaFolders` id
   * (recorded).
   */
  async getUserViews(): Promise<BaseItemDto[]> {
    const query = { includeHidden: 'true' };
    return (await this.get('UserViews', baseItemQueryResultSchema, query)).Items;
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

  /**
   * Jellyfin's Instant Mix for one track: up to `limit` similar tracks from the person's own
   * library, `GET /Items/{id}/InstantMix`, with the index's fields.
   */
  async getInstantMix(itemId: string, limit: number): Promise<IndexItem[]> {
    const query = { Limit: String(limit), Fields: INDEX_FIELDS };
    const path = `Items/${encodeURIComponent(itemId)}/InstantMix`;
    return (await this.get(path, indexQueryResultSchema, query)).Items;
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

  /** A track or an album as the token's own user sees it: `GET /Items/{id}`. */
  getPlayable(itemId: string): Promise<PlayableItem> {
    return this.get(`Items/${encodeURIComponent(itemId)}`, playableItemSchema);
  }

  /** An album's tracks as the token's own user sees them, in Jellyfin's disc and track order. */
  async getAlbumPlayables(albumId: string): Promise<PlayableItem[]> {
    const query = {
      ParentId: albumId,
      IncludeItemTypes: 'Audio',
      SortBy: 'ParentIndexNumber,IndexNumber,SortName',
      Fields: 'MediaStreams',
    };
    return (await this.get('Items', playableQueryResultSchema, query)).Items;
  }

  /**
   * Tells Jellyfin a track started playing: `POST /Sessions/Playing`. Jellyfin times the play
   * itself from the start, progress and stop it is sent; it takes no listening time.
   */
  async reportStart(report: PlaybackReport): Promise<void> {
    await this.post('Sessions/Playing', playbackInfo(report), noContentSchema);
  }

  /** Where the track is, and whether it is paused: `POST /Sessions/Playing/Progress`. */
  async reportProgress(report: PlaybackReport): Promise<void> {
    await this.post('Sessions/Playing/Progress', playbackInfo(report), noContentSchema);
  }

  /**
   * The play ended at `position`: `POST /Sessions/Playing/Stopped`. Jellyfin counts a music track
   * played at its start and keeps no resume point for it, wherever it stopped (recorded).
   */
  async reportStopped(report: Omit<PlaybackReport, 'paused'>): Promise<void> {
    const json = {
      ItemId: report.itemId,
      PositionTicks: Math.round(report.position * TICKS_PER_SECOND),
      PlaySessionId: report.playSessionId,
    };
    await this.post('Sessions/Playing/Stopped', json, noContentSchema);
  }

  /** The token's own user's state on one item: `GET /UserItems/{id}/UserData`. */
  getUserData(itemId: string): Promise<UserItemData> {
    return this.get(`UserItems/${encodeURIComponent(itemId)}/UserData`, userItemDataSchema);
  }

  /**
   * A track's own file, untranscoded, passing `range` through: `GET /Audio/{id}/stream?static=true`.
   * Jellyfin serves this route to anyone who has the id (checked live), so a caller first checks
   * the person can see the track with `getPlayable`.
   */
  openAudio(itemId: string, range?: string): Promise<UpstreamFile> {
    const url = this.url(`Audio/${encodeURIComponent(itemId)}/stream`, { static: 'true' });
    const authorization = buildAuthorizationHeader(this.device, this.opts.token);
    return openStream(this.opts.fetch, url, { authorization }, range, fileHeadersSchema);
  }

  /**
   * An item's primary image, as Jellyfin stores it or scaled down to at most `maxWidth` pixels
   * wide: `GET /Items/{id}/Images/Primary`. With no `Accept` asking for another format, Jellyfin
   * answers JPEG (recorded).
   */
  openImage(itemId: string, maxWidth?: number): Promise<UpstreamFile<ImageHeaders>> {
    const query: Record<string, string> =
      maxWidth === undefined ? {} : { maxWidth: String(maxWidth) };
    const url = this.url(`Items/${encodeURIComponent(itemId)}/Images/Primary`, query);
    const authorization = buildAuthorizationHeader(this.device, this.opts.token);
    return openStream(this.opts.fetch, url, { authorization }, undefined, imageHeadersSchema);
  }
}

/** A start or progress report's body: `PlaybackStartInfo` and `PlaybackProgressInfo` share it. */
function playbackInfo(report: PlaybackReport) {
  return {
    ItemId: report.itemId,
    PositionTicks: Math.round(report.position * TICKS_PER_SECOND),
    IsPaused: report.paused,
    PlayMethod: 'DirectPlay',
    PlaySessionId: report.playSessionId,
  };
}
