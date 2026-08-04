/**
 * The domain model every `JellyfinClient` method returns.
 *
 * Jellyfin's own `BaseItemDto` JSON is never handed to callers — see
 * `schemas/raw.ts` and `normalize.ts`. Artwork is represented as an
 * `imageTag` (Jellyfin's own cache-busting value), not a built URL: building
 * the URL needs the access token and base URL, which `normalize.ts`
 * deliberately doesn't have — see `client.ts`'s `imageUrl`/`streamUrl`,
 * which combine an item's id (and, for artwork, its `imageTag`) with the
 * client's own token via `urls.ts`'s pure builders.
 */

export interface Artist {
  id: string;
  name: string;
  overview: string | null;
  imageTag: string | null;
  /** Best-effort; see `rawBaseItemDtoSchema`'s `ChildCount` doc comment. */
  albumCount: number | null;
}

export interface Album {
  id: string;
  name: string;
  sortName: string | null;
  /** The id of the item's primary album artist, if Jellyfin populated one —
   * see `normalize.ts`'s `normalizeAlbum` for the `AlbumArtists`/
   * `ArtistItems` fallback this is derived from. */
  artistId: string | null;
  artistName: string | null;
  productionYear: number | null;
  overview: string | null;
  genres: string[];
  imageTag: string | null;
  /** Best-effort; see `rawBaseItemDtoSchema`'s `ChildCount` doc comment. */
  trackCount: number | null;
}

export interface Track {
  id: string;
  name: string;
  albumId: string | null;
  albumName: string | null;
  /** Every credited artist name, track-level (`Artists`) — may differ from
   * the containing album's artist for a various-artists compilation. */
  artistNames: string[];
  /** Track number within its disc, when known. */
  trackNumber: number | null;
  /** Disc number within its album, when known. */
  discNumber: number | null;
  durationSeconds: number | null;
  imageTag: string | null;
  genres: string[];
}

export interface LibraryPage<T> {
  items: T[];
  /** Total matching records upstream, independent of how many were returned
   * in this page — required for correct pagination, never guessed. */
  total: number;
  startIndex: number;
}

export interface SearchResults {
  artists: Artist[];
  albums: Album[];
  tracks: Track[];
}

export interface UserProfile {
  id: string;
  name: string;
  serverId: string | null;
}

export interface LoginResult {
  token: string;
  serverId: string | null;
  user: UserProfile;
}
