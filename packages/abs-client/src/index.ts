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
  PodcastSubscribeMetadata,
  SubscribePodcastParams,
} from './client.js';
export type { FetchLike } from './http.js';
export { AbsError, isAbsError } from './errors.js';
export type { AbsErrorCode } from './errors.js';
export { buildCoverPath, buildAudioTrackPath } from './urls.js';
export type { CoverUrlOptions } from './urls.js';

export type {
  Library,
  LibraryFolder,
  LibraryItem,
  Media,
  Book,
  Podcast,
  PodcastEpisode,
  AudioTrack,
  Chapter,
  AuthorRef,
  SeriesSequence,
  AuthorBadge,
  SeriesBadge,
  Shelf,
  Series,
  Author,
  AuthorDetail,
  Collection,
  Playlist,
  FilterData,
  SearchResults,
  MediaProgress,
  Bookmark,
  UserProfile,
  LoginResult,
  PlaybackSession,
  PodcastDirectoryResult,
  PodcastFeedPreview,
  PodcastFeedEpisode,
  PodcastFeedChapter,
} from './domain.js';
