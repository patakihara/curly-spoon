export { JellyfinClient } from './client.js';
export type {
  JellyfinClientConfig,
  LibraryQuery,
  ArtistsQuery,
  AlbumsQuery,
  TracksQuery,
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
  LibraryPage,
  SearchResults,
  UserProfile,
  LoginResult,
} from './domain.js';
