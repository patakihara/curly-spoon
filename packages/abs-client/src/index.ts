export { AbsClient } from './client.js';
export type {
  AbsClientConfig,
  LibraryItemsPage,
  LibraryItemsQuery,
  SeriesPage,
  GetItemOptions,
  PlaySessionOptions,
  SyncSessionBody,
  UpdateProgressBody,
  ServerProbe,
} from './client.js';
export type { FetchLike } from './http.js';
export { AbsError, isAbsError } from './errors.js';
export type { AbsErrorCode } from './errors.js';
export { buildCoverPath, buildAudioTrackPath } from './urls.js';
export type { CoverUrlOptions } from './urls.js';

export type {
  Library,
  LibraryItem,
  Media,
  Book,
  Podcast,
  PodcastEpisode,
  AudioTrack,
  Chapter,
  AuthorRef,
  SeriesSequence,
  Shelf,
  Series,
  Author,
  Collection,
  Playlist,
  FilterData,
  SearchResults,
  MediaProgress,
  Bookmark,
  UserProfile,
  LoginResult,
  PlaybackSession,
} from './domain.js';
