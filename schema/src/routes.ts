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
import { HealthResponse } from './health.js';
import { AbsStreamParams, AudioBytes, PlaybackPlan, PlayBody } from './play.js';
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
   * or 416 for a range past the end. `response` describes the bytes.
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

export const streamAbs = {
  method: 'GET',
  path: '/api/stream/abs/{itemId}/{ino}',
  operationId: 'streamAbs',
  summary: "Stream an Audiobookshelf file with the signed-in person's own access, ranges and all",
  responseDescription: 'The whole file.',
  response: AudioBytes,
  access: 'member',
  params: AbsStreamParams,
  stream: true,
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
  streamAbs,
];
