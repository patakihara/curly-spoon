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
  /** Total play count for this artist's own item row. `0` when absent, matching `favorite`'s
   * "always a definite value" convention — see `normalize.ts`'s `normalizePlayCount`. Wave
   * 13e-2 reads this (and `Album`/`Track`'s copies) to build a music taste profile alongside
   * the audiobook-side `mediaProgress[]` signal. */
  playCount: number;
  /** Epoch milliseconds of this item's last play, or `null` if it has never been played (or
   * the server didn't report a date) — see `normalize.ts`'s `normalizeLastPlayedAt`. Never
   * `NaN`: an unparseable upstream date degrades to `null`, the same as an absent one. */
  lastPlayedAt: number | null;
  /** `ProviderIds.MusicBrainzArtist`, when Jellyfin's scanner found a match — what
   * ListenBrainz keys artist lookups on. `null` far more often than not: population depends
   * on the scanner's metadata match, not every library entry has one. */
  musicBrainzArtistId: string | null;
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
  /** See `Artist.playCount`'s doc comment — same convention, this album's own play count. */
  playCount: number;
  /** See `Artist.lastPlayedAt`'s doc comment. */
  lastPlayedAt: number | null;
  /** `ProviderIds.MusicBrainzAlbum` — see `Artist.musicBrainzArtistId`'s doc comment for the
   * general shape; `null` unless the scanner found a match. */
  musicBrainzAlbumId: string | null;
  /** `ProviderIds.MusicBrainzReleaseGroup` — MusicBrainz's release-group id, distinct from
   * `musicBrainzAlbumId` (a specific release): a release group is what ties different
   * editions/pressings of the same album together, which some catalogue lookups key on
   * instead of a specific release. */
  musicBrainzReleaseGroupId: string | null;
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
  /** See `Artist.playCount`'s doc comment — same convention, this track's own play count. This
   * is the field wave 13e-2 actually reads: a track is the finest-grained unit Jellyfin reports
   * `UserData` on, so track-level `playCount`/`lastPlayedAt` roll up into per-genre/per-artist
   * taste the same way the artist/album copies would, without losing resolution. */
  playCount: number;
  /** See `Artist.lastPlayedAt`'s doc comment. */
  lastPlayedAt: number | null;
  /** `ProviderIds.MusicBrainzTrack` — MusicBrainz's recording id, what ListenBrainz keys
   * track-level scrobble/lookup matching on. `null` unless the scanner found a match. */
  musicBrainzTrackId: string | null;
}

export interface Playlist {
  id: string;
  name: string;
  imageTag: string | null;
  /** Best-effort; see `rawBaseItemDtoSchema`'s `ChildCount` doc comment. */
  trackCount: number | null;
}

/**
 * One occurrence of a track within a playlist, in playlist order — never re-sorted, see
 * `schemas/raw.ts`'s playlists section for why `GET /Playlists/{id}/Items` is trustworthy
 * as-given.
 *
 * `playlistItemId` is the id of *this occurrence*, not of `track` itself: the same track can
 * appear twice in one playlist, each with its own `playlistItemId`, and Jellyfin's removal
 * endpoint keys on this value precisely so one occurrence can be removed without touching the
 * other. Never use `track.id` for removal. See `JellyfinClient.removeFromPlaylist`'s doc
 * comment.
 */
export interface PlaylistItem {
  playlistItemId: string;
  track: Track;
}

export interface LibraryPage<T> {
  items: T[];
  /** Total matching records upstream, independent of how many were returned
   * in this page — required for correct pagination, never guessed. */
  total: number;
  startIndex: number;
}

/**
 * One of the server's top-level library folders (`GET /Library/MediaFolders`) — the
 * Jellyfin analogue of `@auralis/abs-client`'s `Library`, used the same way: find the one
 * whose `collectionType` matches what a caller needs (e.g. `'music'`) rather than acting
 * on every library the server hosts. See `JellyfinClient.getLibraries`'s doc comment for
 * the verified endpoint and permission requirement, and `refreshItem`'s for why finding
 * the right folder id matters — a rescan can be scoped to it instead of the whole server.
 */
export interface Library {
  id: string;
  name: string;
  /** Jellyfin's `CollectionType` enum value, serialized as its lowercase name (`'music'`,
   * `'movies'`, `'books'`, ...) — verified against `Jellyfin.Data/Enums/CollectionType.cs`,
   * 2026-08-05. `null` for a folder Jellyfin hasn't classified (or a raw response missing
   * the field, which `normalize.ts`'s `normalizeLibrary` folds into the same `null`). */
  collectionType: string | null;
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
