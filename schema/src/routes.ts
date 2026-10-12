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
import { HealthResponse } from './health.js';
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
import {
  ActiveQueueBody,
  AddToQueueBody,
  ListeningSession,
  ListeningSessionList,
  PutQueueBody,
  Queue,
  QueueParams,
  QueueStyleBody,
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
   * Streams audio instead of JSON: the whole file with 200, or with `Range` 206 and that range,
   * or 416 for a range past the end. `response` describes the bytes. HEAD answers the same
   * status and headers with no body.
   */
  stream?: true;
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
  stream: true,
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
  stream: true,
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
  summary: "One of this device's queues: its current item, your queue and playing-from",
  responseDescription:
    'The queue, with the newer of where this device was and where the upstream says.',
  response: Queue,
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
];
