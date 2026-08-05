export { JellyfinClient, secondsToTicks } from './client.js';
export type {
  JellyfinClientConfig,
  LibraryQuery,
  ArtistsQuery,
  AlbumsQuery,
  TracksQuery,
  PlaylistsQuery,
  SearchOptions,
  SortOrder,
} from './client.js';
export type { FetchLike } from './http.js';
export { JellyfinError, isJellyfinError } from './errors.js';
export type { JellyfinErrorCode } from './errors.js';
export { buildAuthorizationHeader } from './auth.js';
export type { JellyfinDeviceInfo } from './auth.js';
export { buildImageUrl, buildStreamUrl } from './urls.js';
export type { ImageUrlOptions, StreamUrlOptions, JellyfinImageType } from './urls.js';

export type {
  Artist,
  Album,
  Track,
  Playlist,
  PlaylistItem,
  Library,
  LibraryPage,
  SearchResults,
  UserProfile,
  LoginResult,
  Lyrics,
  LyricLine,
} from './domain.js';
