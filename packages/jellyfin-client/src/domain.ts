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
  /** Always a definite boolean, never absent — see `normalize.ts`'s `favoriteState` for why
   * a missing/absent upstream `UserData.IsFavorite` normalizes to `false` rather than a
   * third "unknown" state a consumer would otherwise have to handle. */
  favorite: boolean;
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
  /** See `Artist.favorite`'s doc comment — same "always a definite boolean" guarantee. */
  favorite: boolean;
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
  /** See `Artist.favorite`'s doc comment — same "always a definite boolean" guarantee. */
  favorite: boolean;
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

/** One line of a track's lyrics. `startSeconds` is `null` for an unsynced line — see
 * `Lyrics.synced`'s doc comment for how a caller should read that. */
export interface LyricLine {
  text: string;
  startSeconds: number | null;
}

/**
 * A track's lyrics, or the reason there's nothing to show — `JellyfinClient.getLyrics`
 * returns `null` (not this type) for "no lyrics at all"; this type only exists once
 * Jellyfin *has* something.
 *
 * `synced` is derived from whether every line carries a `startSeconds`, not from
 * Jellyfin's own `LyricMetadata.IsSynced` — see `schemas/raw.ts`'s `IsSynced` field
 * comment for why that field can't be trusted (it's never populated on this endpoint).
 * `false` means every line should render as plain, unhighlighted text — never treat an
 * unsynced line's missing timestamp as "starts at 0".
 */
export interface Lyrics {
  lines: LyricLine[];
  synced: boolean;
}
