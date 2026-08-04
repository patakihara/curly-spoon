/**
 * Pure builders for the two URLs a music player needs directly: a playable
 * audio stream and item artwork. Unlike `@auralis/abs-client`'s
 * `buildCoverPath`/`buildAudioTrackPath` — which return BFF-relative paths,
 * because Audiobookshelf bytes are proxied through the BFF so its token never
 * reaches the browser — these return full, absolute Jellyfin URLs with the
 * access token embedded as the `ApiKey` query parameter.
 *
 * That is a deliberate difference, not an oversight: Jellyfin's own image and
 * audio elements are routinely pointed straight at the media server (browsers
 * cannot attach an `Authorization` header to an `<audio>`/`<img>` `src`), and
 * the server supports exactly this via a query-string token. Verified against
 * the real server source, not memory:
 *
 * - Stream route `GET /Audio/{itemId}/stream`: `Jellyfin.Api/Controllers/
 *   AudioController.cs`'s `GetAudioStream` — the `static`/`container`/
 *   `deviceId` query parameter names come straight from its `[FromQuery]`
 *   parameter declarations.
 * - Image route `GET /Items/{itemId}/Images/{imageType}`: `Jellyfin.Api/
 *   Controllers/ImageController.cs`'s `GetItemImage` — `tag`/`maxWidth`/
 *   `maxHeight`/`quality` likewise come from its `[FromQuery]` declarations.
 * - The `ApiKey` query parameter as a token carrier: `Jellyfin.Server.
 *   Implementations/Security/AuthorizationContext.cs` checks
 *   `queryString["ApiKey"]` unconditionally once no header token is present —
 *   the alternate `api_key` (lowercase, underscored) spelling only works when
 *   the server has the legacy-auth compatibility flag on, so `ApiKey` is the
 *   one guaranteed to work.
 *
 * Whether the BFF hands these URLs to the browser directly or proxies them
 * itself (as it does for Audiobookshelf, to keep the token off the wire to
 * the client) is a decision for the BFF wave that consumes this package, not
 * this one.
 */

/**
 * Join a base URL with an absolute-style path (`/Audio/...`) without losing
 * any subpath the base URL already carries. `new URL(path, base)` would
 * silently drop a base path like `http://host/jellyfin` down to
 * `http://host`, because a path starting with `/` is resolved against the
 * origin, not the base's own path — which would break every reverse-proxied
 * Jellyfin install serving from a subpath.
 */
function joinUrl(baseUrl: string, path: string): URL {
  const base = new URL(baseUrl);
  const basePath = base.pathname === '/' ? '' : base.pathname.replace(/\/+$/, '');
  base.pathname = `${basePath}${path}`;
  base.search = '';
  base.hash = '';
  return base;
}

export interface StreamUrlOptions {
  /** If true (the default), the original file is streamed unmodified — no
   * transcoding. Music playback should almost always want this: transcoding
   * audio buys nothing a modern client can't already decode and costs CPU on
   * the server. */
  static?: boolean;
  /** Optional container hint, e.g. `'mp3'`. Only meaningful when `static` is
   * false, since a static stream is always served in its original container. */
  container?: string;
  /** The requesting device's id, so the server can track/stop this stream. */
  deviceId?: string;
}

/** Builds a playable, absolute URL for an audio item, with the access token
 * embedded so an `<audio>` element (or any client with no header control) can
 * use it directly. */
export function buildStreamUrl(
  baseUrl: string,
  itemId: string,
  token: string,
  options: StreamUrlOptions = {},
): string {
  const url = joinUrl(baseUrl, `/Audio/${encodeURIComponent(itemId)}/stream`);
  url.searchParams.set('static', String(options.static ?? true));
  if (options.container !== undefined) url.searchParams.set('container', options.container);
  if (options.deviceId !== undefined) url.searchParams.set('deviceId', options.deviceId);
  url.searchParams.set('ApiKey', token);
  return url.toString();
}

export type JellyfinImageType = 'Primary' | 'Backdrop' | 'Banner' | 'Logo' | 'Thumb';

export interface ImageUrlOptions {
  /** Which image slot to fetch. Defaults to `'Primary'` — cover art. */
  imageType?: JellyfinImageType;
  /** The item's `ImageTags[imageType]` value, as a cache-busting query param —
   * without it, a CDN or the browser cache can't tell two different covers
   * for the same item id apart across a re-scan. */
  tag?: string;
  maxWidth?: number;
  maxHeight?: number;
  /** 0-100. Jellyfin defaults to 90 server-side when omitted. */
  quality?: number;
}

/** Builds an absolute artwork URL for an item, with the access token embedded
 * so an `<img>` element can use it directly. */
export function buildImageUrl(
  baseUrl: string,
  itemId: string,
  token: string,
  options: ImageUrlOptions = {},
): string {
  const imageType = options.imageType ?? 'Primary';
  const url = joinUrl(baseUrl, `/Items/${encodeURIComponent(itemId)}/Images/${imageType}`);
  if (options.tag !== undefined) url.searchParams.set('tag', options.tag);
  if (options.maxWidth !== undefined) url.searchParams.set('maxWidth', String(options.maxWidth));
  if (options.maxHeight !== undefined) {
    url.searchParams.set('maxHeight', String(options.maxHeight));
  }
  if (options.quality !== undefined) url.searchParams.set('quality', String(options.quality));
  url.searchParams.set('ApiKey', token);
  return url.toString();
}
