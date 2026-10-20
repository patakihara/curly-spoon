import {
  Account,
  AppToken,
  CallbackQuery,
  DeviceList,
  DeviceParams,
  Device,
  LoginQuery,
  Me,
  Ok,
  Redirect,
  RenameDeviceBody,
  SetupBody,
  SetupStatus,
  TokenBody,
  UserList,
} from './auth.js';
import {
  Bookmark,
  BookmarkList,
  BookmarkParams,
  BookmarksQuery,
  CreateBookmarkBody,
} from './bookmarks.js';
import { Feed } from './feed.js';
import { HealthResponse } from './health.js';
import {
  AddListItemBody,
  CreateListBody,
  ListDetail,
  ListParams,
  ListSummaryList,
  PlayListBody,
  PutListItemsBody,
  UpdateListBody,
} from './lists.js';
import { Lyrics } from './lyrics.js';
import {
  ArtQuery,
  ImageBytes,
  ItemDetail,
  ItemParams,
  LibraryList,
  LibraryParams,
  LibraryQuery,
} from './library.js';
import {
  AudioBytes,
  MediaHlsParams,
  MediaTrackParams,
  PlaybackPlan,
  PlayBody,
  PlayParams,
  ProgressAnswer,
  ProgressBody,
  ProgressReport,
} from './play.js';
import { SearchQuery, SearchResults, SuggestionList, SuggestQuery } from './search.js';
import {
  ActiveQueueBody,
  AddToQueueBody,
  ListeningSession,
  ListeningSessionList,
  PutQueueBody,
  Queue,
  QueueParams,
  QueueStyleBody,
  QueueView,
  StepBody,
} from './sessions.js';
import { type z } from './zod.js';

/**
 * Who may call a route. `setup` is public while no admin exists and admin-only once one does.
 * The server enforces it from here, so a route without one cannot be served.
 */
export type Access = 'public' | 'member' | 'admin' | 'setup';

/** One HTTP route: the server serves it and the OpenAPI document describes it, from this alone. */
export interface Route<Response extends z.ZodTypeAny = z.ZodTypeAny> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** `{name}` marks a path parameter, as OpenAPI writes it. */
  path: string;
  operationId: string;
  summary: string;
  /** The 200 response's description. */
  responseDescription: string;
  response: Response;
  access: Access;
  /** The JSON request body; the server answers 400 to one that does not parse. */
  body?: z.ZodTypeAny;
  /** The query string; the server answers 400 to one that does not parse. */
  query?: z.AnyZodObject;
  /** The path parameters, one per `{name}` in the path. */
  params?: z.AnyZodObject;
  /** Answers 302 to the `location` the handler returns, not 200 with a body. */
  redirect?: true;
  /** May answer 429 with `Retry-After`. */
  rateLimited?: true;
  /**
   * Streams bytes instead of JSON, and `response` describes them. `audio` answers the whole file
   * with 200, or with `Range` 206 and that range, or 416 for a range past the end; `image`
   * answers the whole image with 200 and takes no range. HEAD answers the same status and
   * headers with no body.
   */
  stream?: 'audio' | 'image';
}

export const health = {
  method: 'GET',
  path: '/api/health',
  operationId: 'getHealth',
  summary: 'Whether the server is up',
  responseDescription: 'The server is up.',
  response: HealthResponse,
  access: 'public',
} as const satisfies Route;

export const getSetup = {
  method: 'GET',
  path: '/api/setup',
  operationId: 'getSetup',
  summary: 'Whether an admin has been claimed',
  responseDescription: 'Whether setup has run.',
  response: SetupStatus,
  access: 'public',
} as const satisfies Route;

export const postSetup = {
  method: 'POST',
  path: '/api/setup',
  operationId: 'postSetup',
  summary: 'Claim admin with the one-time code, or, as an admin, make another username admin',
  responseDescription: 'The user who is now an admin.',
  response: Me,
  access: 'setup',
  body: SetupBody,
} as const satisfies Route;

export const login = {
  method: 'GET',
  path: '/api/auth/login',
  operationId: 'login',
  summary: 'Start signing in through the household sign-on',
  responseDescription: 'Sent on to the sign-on.',
  response: Redirect,
  access: 'public',
  query: LoginQuery,
  redirect: true,
  rateLimited: true,
} as const satisfies Route;

export const loginCallback = {
  method: 'GET',
  path: '/api/auth/callback',
  operationId: 'loginCallback',
  summary: 'Finish signing in: the sign-on sends the browser back here',
  responseDescription: 'Signed in: back to the web app, or on to the Android app with a code.',
  response: Redirect,
  access: 'public',
  query: CallbackQuery,
  redirect: true,
  rateLimited: true,
} as const satisfies Route;

export const appToken = {
  method: 'POST',
  path: '/api/auth/token',
  operationId: 'appToken',
  summary: "Swap the Android app's one-time code for its bearer token",
  responseDescription: "The app's token and device.",
  response: AppToken,
  access: 'public',
  body: TokenBody,
  rateLimited: true,
} as const satisfies Route;

export const getMe = {
  method: 'GET',
  path: '/api/auth/me',
  operationId: 'getMe',
  summary: 'Who is signed in, on which device, and their upstream links',
  responseDescription: 'The signed-in user.',
  response: Account,
  access: 'member',
} as const satisfies Route;

export const logout = {
  method: 'POST',
  path: '/api/auth/logout',
  operationId: 'logout',
  summary: 'Sign out of this session',
  responseDescription: 'Signed out.',
  response: Ok,
  access: 'member',
} as const satisfies Route;

export const listDevices = {
  method: 'GET',
  path: '/api/devices',
  operationId: 'listDevices',
  summary: "The signed-in user's own devices",
  responseDescription: 'Every device this user has signed in from.',
  response: DeviceList,
  access: 'member',
} as const satisfies Route;

export const renameDevice = {
  method: 'PATCH',
  path: '/api/devices/{id}',
  operationId: 'renameDevice',
  summary: 'Rename one of your own devices',
  responseDescription: 'The renamed device.',
  response: Device,
  access: 'member',
  params: DeviceParams,
  body: RenameDeviceBody,
} as const satisfies Route;

export const deleteDevice = {
  method: 'DELETE',
  path: '/api/devices/{id}',
  operationId: 'deleteDevice',
  summary: 'Remove one of your own devices, signing it out',
  responseDescription: 'The device and its sessions are gone.',
  response: Ok,
  access: 'member',
  params: DeviceParams,
} as const satisfies Route;

export const listUsers = {
  method: 'GET',
  path: '/api/admin/users',
  operationId: 'listUsers',
  summary: 'Who can sign in, and their role',
  responseDescription: 'Every user.',
  response: UserList,
  access: 'admin',
} as const satisfies Route;

export const play = {
  method: 'POST',
  path: '/api/play',
  operationId: 'play',
  summary: 'Plan how to play an item, as the signed-in person',
  responseDescription: 'The tracks to play, streamed through this server, and where to start.',
  response: PlaybackPlan,
  access: 'member',
  body: PlayBody,
} as const satisfies Route;

export const mediaTrack = {
  method: 'GET',
  path: '/api/media/{ref}/tracks/{n}',
  operationId: 'getMediaTrack',
  summary: "One track of an item, with the signed-in person's own access, ranges and all",
  responseDescription: 'The whole track.',
  response: AudioBytes,
  access: 'member',
  params: MediaTrackParams,
  stream: 'audio',
} as const satisfies Route;

export const reportProgress = {
  method: 'POST',
  path: '/api/progress',
  operationId: 'reportProgress',
  summary: "Report where the person is in a plan's item, and how long they listened, to its server",
  responseDescription:
    "Whether the report was taken, reaching the item's server, and the number of the last one taken.",
  response: ProgressAnswer,
  access: 'member',
  body: ProgressBody,
} as const satisfies Route;

export const closePlay = {
  method: 'POST',
  path: '/api/play/{playId}/close',
  operationId: 'closePlay',
  summary: "Close a plan's open playback session, with a last progress report when given",
  responseDescription: 'The session is closed.',
  response: Ok,
  access: 'member',
  params: PlayParams,
  body: ProgressReport.optional(),
} as const satisfies Route;

export const mediaHls = {
  method: 'GET',
  path: '/api/media/{ref}/hls/{playId}/{file}',
  operationId: 'getMediaHls',
  summary: "A transcode's playlist or one of its segments, with the signed-in person's own access",
  responseDescription: 'The playlist, its segment names relative to it, or the segment.',
  response: AudioBytes,
  access: 'member',
  params: MediaHlsParams,
  stream: 'audio',
} as const satisfies Route;

export const listBookmarks = {
  method: 'GET',
  path: '/api/bookmarks',
  operationId: 'listBookmarks',
  summary: "The signed-in person's bookmarks in one item, from its own server",
  responseDescription: "The item's bookmarks, in the order they sit in it.",
  response: BookmarkList,
  access: 'member',
  query: BookmarksQuery,
} as const satisfies Route;

export const createBookmark = {
  method: 'POST',
  path: '/api/bookmarks',
  operationId: 'createBookmark',
  summary: 'Bookmark a place in an item, on its own server, as the signed-in person',
  responseDescription: 'The bookmark made.',
  response: Bookmark,
  access: 'member',
  body: CreateBookmarkBody,
} as const satisfies Route;

export const deleteBookmark = {
  method: 'DELETE',
  path: '/api/bookmarks/{ref}/{time}',
  operationId: 'deleteBookmark',
  summary: "Delete one of the signed-in person's bookmarks, by its item and time",
  responseDescription: 'The bookmark is gone.',
  response: Ok,
  access: 'member',
  params: BookmarkParams,
} as const satisfies Route;

export const listSessions = {
  method: 'GET',
  path: '/api/sessions',
  operationId: 'listSessions',
  summary: "The signed-in person's listening sessions, one per device",
  responseDescription: 'Each device with a session, which one is asking, and what each plays.',
  response: ListeningSessionList,
  access: 'member',
} as const satisfies Route;

export const getQueue = {
  method: 'GET',
  path: '/api/queues/{type}',
  operationId: 'getQueue',
  summary:
    "One of this device's queues as the queue page shows it: every entry labelled, autoplay's kept pick and the newest plays",
  responseDescription:
    'The queue, with the newer of where this device was and where the upstream says.',
  response: QueueView,
  access: 'member',
  params: QueueParams,
} as const satisfies Route;

export const putQueue = {
  method: 'PUT',
  path: '/api/queues/{type}',
  operationId: 'putQueue',
  summary: "Reorder or remove entries of one of this device's queues",
  responseDescription: 'The queue as it now is; 409 when `rev` is not the session revision.',
  response: Queue,
  access: 'member',
  params: QueueParams,
  body: PutQueueBody,
} as const satisfies Route;

export const addToQueue = {
  method: 'POST',
  path: '/api/queues/{type}/items',
  operationId: 'addToQueue',
  summary: 'Play an item now, put it next, add it to the end, or do what its button does',
  responseDescription:
    'The queue as it now is; 400 `wrong_queue` for an item of the other queue, 404 for one not indexed.',
  response: Queue,
  access: 'member',
  params: QueueParams,
  body: AddToQueueBody,
} as const satisfies Route;

export const stepSession = {
  method: 'POST',
  path: '/api/sessions/this/step',
  operationId: 'stepSession',
  summary: "Next or back on this device's session; a queue that runs out autoplays",
  responseDescription: "This device's session, with each queue's current item.",
  response: ListeningSession,
  access: 'member',
  body: StepBody,
} as const satisfies Route;

export const setActiveQueue = {
  method: 'PUT',
  path: '/api/sessions/this/active',
  operationId: 'setActiveQueue',
  summary: 'The meta-queue switch: drive the other queue, pausing this one',
  responseDescription: "This device's session, with each queue's current item.",
  response: ListeningSession,
  access: 'member',
  body: ActiveQueueBody,
} as const satisfies Route;

export const setQueueStyle = {
  method: 'PUT',
  path: '/api/sessions/this/style',
  operationId: 'setQueueStyle',
  summary: "This device's queue style: YouTube Music or Spotify",
  responseDescription: "This device's session, with each queue's current item.",
  response: ListeningSession,
  access: 'member',
  body: QueueStyleBody,
} as const satisfies Route;

export const listLibrary = {
  method: 'GET',
  path: '/api/library/{medium}',
  operationId: 'listLibrary',
  summary: "The signed-in person's books, podcast shows or albums",
  responseDescription:
    'Every indexed book, show or album in the libraries this person may open: by title, by author, host or artist, or shuffled by a seed.',
  response: LibraryList,
  access: 'member',
  params: LibraryParams,
  query: LibraryQuery,
} as const satisfies Route;

export const getFeed = {
  method: 'GET',
  path: '/api/feed',
  operationId: 'getFeed',
  summary: "Browse's Up next and second-most-recent shelves for the signed-in person",
  responseDescription:
    'Up next, then your second most recent book and show, each card what plays next of what you listened to, only what you own; an empty shelf is left out, and all are for someone not linked to Audiobookshelf.',
  response: Feed,
  access: 'member',
} as const satisfies Route;

export const getItem = {
  method: 'GET',
  path: '/api/items/{ref}',
  operationId: 'getItem',
  summary: 'One book, show, episode or album the signed-in person may open',
  responseDescription:
    "Its header, then a book's chapters, a show's episodes in its order, an album's tracks, or an episode's show, notes and standing.",
  response: ItemDetail,
  access: 'member',
  params: ItemParams,
} as const satisfies Route;

export const mediaArt = {
  method: 'GET',
  path: '/api/media/{ref}/art',
  operationId: 'getMediaArt',
  summary: "A book's, show's or album's art, with the signed-in person's own access",
  responseDescription: 'The image, at the size asked for, or as stored.',
  response: ImageBytes,
  access: 'member',
  params: ItemParams,
  query: ArtQuery,
  stream: 'image',
} as const satisfies Route;

export const getSearchSuggest = {
  method: 'GET',
  path: '/api/search/suggest',
  operationId: 'getSearchSuggest',
  summary: 'Suggestions as the signed-in person types a search',
  responseDescription:
    "Their own recent searches, then titles and names from the household's library index, best first.",
  response: SuggestionList,
  access: 'member',
  query: SuggestQuery,
} as const satisfies Route;

export const getSearch = {
  method: 'GET',
  path: '/api/search',
  operationId: 'getSearch',
  summary: "A search of the household's library, kept among the signed-in person's recent searches",
  responseDescription: 'The best results first, of the kinds asked for, or of every kind.',
  response: SearchResults,
  access: 'member',
  query: SearchQuery,
} as const satisfies Route;

export const getLyrics = {
  method: 'GET',
  path: '/api/lyrics/{ref}',
  operationId: 'getLyrics',
  summary: "One track's lyrics, for a signed-in person who may open its album",
  responseDescription:
    "Jellyfin's own synced lines, else LRCLIB's, else plain lines, an instrumental or none, kept once found.",
  response: Lyrics,
  access: 'member',
  params: ItemParams,
} as const satisfies Route;

export const listLists = {
  method: 'GET',
  path: '/api/lists',
  operationId: 'listLists',
  summary: "The signed-in person's listening lists, podcast playlists and digests",
  responseDescription: 'The Digest first, made on the first ask, then the others, oldest first.',
  response: ListSummaryList,
  access: 'member',
} as const satisfies Route;

export const createList = {
  method: 'POST',
  path: '/api/lists',
  operationId: 'createList',
  summary: 'Make a listening list, a podcast playlist or a custom digest',
  responseDescription:
    'The list made; 400 `wrong_kind` for shows or an order on a list that is not a digest, or a show that is not one, 404 for a show not indexed or outside your libraries.',
  response: ListDetail,
  access: 'member',
  body: CreateListBody,
} as const satisfies Route;

export const getList = {
  method: 'GET',
  path: '/api/lists/{id}',
  operationId: 'getList',
  summary: "One of the signed-in person's lists, with its entries as they stand now",
  responseDescription:
    "Its summary, a digest's shows, and its entries: a digest's by its rule, a playlist's unplayed ones, a listening list's with finished ones crossed off; 404 for a list not yours.",
  response: ListDetail,
  access: 'member',
  params: ListParams,
} as const satisfies Route;

export const updateList = {
  method: 'PATCH',
  path: '/api/lists/{id}',
  operationId: 'updateList',
  summary: "Rename a list, change a digest's order, or choose a custom digest's shows",
  responseDescription:
    'The list as it now is; 400 `fixed_list` for a new name or shows on The Digest, `wrong_kind` for an order or shows on a list that is not a digest, and nothing changed.',
  response: ListDetail,
  access: 'member',
  params: ListParams,
  body: UpdateListBody,
} as const satisfies Route;

export const deleteList = {
  method: 'DELETE',
  path: '/api/lists/{id}',
  operationId: 'deleteList',
  summary: "Delete one of the signed-in person's lists",
  responseDescription:
    'The list is gone; 400 `fixed_list` for The Digest, 404 for a list not yours.',
  response: Ok,
  access: 'member',
  params: ListParams,
} as const satisfies Route;

export const addListItem = {
  method: 'POST',
  path: '/api/lists/{id}/items',
  operationId: 'addListItem',
  summary: 'Add a book or show to the end of a listening list, or an episode to a playlist',
  responseDescription:
    'The list as it now is; 404 for an entry not indexed or outside your libraries, whatever its kind, 400 `wrong_kind` for one the list does not take or any digest, `list_full` past the most a list holds.',
  response: ListDetail,
  access: 'member',
  params: ListParams,
  body: AddListItemBody,
} as const satisfies Route;

export const setListItems = {
  method: 'PUT',
  path: '/api/lists/{id}/items',
  operationId: 'setListItems',
  summary: "Set a listening list's or playlist's entries, whole and in order",
  responseDescription:
    'The list as it now is; refused as adding one entry is, and nothing changed.',
  response: ListDetail,
  access: 'member',
  params: ListParams,
  body: PutListItemsBody,
} as const satisfies Route;

export const playList = {
  method: 'POST',
  path: '/api/lists/{id}/play',
  operationId: 'playList',
  summary: "Play a list now, in its order, on this device's spoken queue",
  responseDescription:
    "The spoken queue: a listening list's or playlist's unplayed entries from `start` onwards, a book as its chapters and a show as its unplayed episodes, the first current and no playing-from; a finished `start` plays from its beginning. A digest plays in its own queue (`digest` names it), from `start` or the episode it was left on, at its position, then its other episodes; the spoken queue it replaces is saved, and comes back when its current item, or its next once that finished, is played. 404 for a list not yours or a `start` not on it, 400 `nothing_to_play` when none is left, 409 `stale_revision`.",
  response: Queue,
  access: 'member',
  params: ListParams,
  body: PlayListBody,
} as const satisfies Route;

/** Every route the API has. The generator and the server's route test both read this list. */
export const routes: readonly Route[] = [
  health,
  getSetup,
  postSetup,
  login,
  loginCallback,
  appToken,
  getMe,
  logout,
  listDevices,
  renameDevice,
  deleteDevice,
  listUsers,
  play,
  reportProgress,
  closePlay,
  mediaTrack,
  mediaHls,
  listBookmarks,
  createBookmark,
  deleteBookmark,
  listSessions,
  getQueue,
  putQueue,
  addToQueue,
  stepSession,
  setActiveQueue,
  setQueueStyle,
  listLibrary,
  getFeed,
  getItem,
  mediaArt,
  getSearchSuggest,
  getSearch,
  getLyrics,
  listLists,
  createList,
  getList,
  updateList,
  deleteList,
  addListItem,
  setListItems,
  playList,
];
