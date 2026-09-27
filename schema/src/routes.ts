import { LogoutResponse, Me, SetupBody, SetupStatus, UserList } from './auth.js';
import { HealthResponse } from './health.js';
import { type z } from './zod.js';

/**
 * Who may call a route. `setup` is public while no admin exists and admin-only once one does.
 * The server enforces it from here, so a route without one cannot be served.
 */
export type Access = 'public' | 'member' | 'admin' | 'setup';

/** One HTTP route: the server serves it and the OpenAPI document describes it, from this alone. */
export interface Route<Response extends z.ZodTypeAny = z.ZodTypeAny> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  operationId: string;
  summary: string;
  /** The 200 response's description. */
  responseDescription: string;
  response: Response;
  access: Access;
  /** The JSON request body; the server answers 400 to one that does not parse. */
  body?: z.ZodTypeAny;
}

export const health = {
  method: 'GET',
  path: '/health',
  operationId: 'getHealth',
  summary: 'Whether the server is up',
  responseDescription: 'The server is up.',
  response: HealthResponse,
  access: 'public',
} as const satisfies Route;

export const getSetup = {
  method: 'GET',
  path: '/setup',
  operationId: 'getSetup',
  summary: 'Whether an admin has been claimed',
  responseDescription: 'Whether setup has run.',
  response: SetupStatus,
  access: 'public',
} as const satisfies Route;

export const postSetup = {
  method: 'POST',
  path: '/setup',
  operationId: 'postSetup',
  summary: 'Claim admin with the one-time code, or, as an admin, make another username admin',
  responseDescription: 'The user who is now an admin.',
  response: Me,
  access: 'setup',
  body: SetupBody,
} as const satisfies Route;

export const getMe = {
  method: 'GET',
  path: '/auth/me',
  operationId: 'getMe',
  summary: 'Who is signed in',
  responseDescription: 'The signed-in user.',
  response: Me,
  access: 'member',
} as const satisfies Route;

export const logout = {
  method: 'POST',
  path: '/auth/logout',
  operationId: 'logout',
  summary: 'Sign out of this session',
  responseDescription: 'Signed out.',
  response: LogoutResponse,
  access: 'member',
} as const satisfies Route;

export const listUsers = {
  method: 'GET',
  path: '/admin/users',
  operationId: 'listUsers',
  summary: 'Who can sign in, and their role',
  responseDescription: 'Every user.',
  response: UserList,
  access: 'admin',
} as const satisfies Route;

/** Every route the API has. The generator and the server's route test both read this list. */
export const routes: readonly Route[] = [health, getSetup, postSetup, getMe, logout, listUsers];
