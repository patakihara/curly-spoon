import { z } from './zod.js';

/** The one cookie the server issues: an opaque pointer to a session row. */
export const SESSION_COOKIE = 'auralis_session';

/** An admin manages providers, paths and approvals; a member only listens and asks. */
export const Role = z.enum(['admin', 'member']).openapi('Role');
export type Role = z.infer<typeof Role>;

/** The join key with the household sign-on, so it keeps that account name's shape. */
export const Username = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

/** What GET /setup answers: whether an admin has been claimed yet. */
export const SetupStatus = z.object({ configured: z.boolean() }).openapi('SetupStatus');
export type SetupStatus = z.infer<typeof SetupStatus>;

/** The first claim carries the one-time code; an admin granting admin later sends none. */
export const SetupBody = z
  .object({ code: z.string().min(1).max(256).optional(), username: Username })
  .openapi('SetupBody');
export type SetupBody = z.infer<typeof SetupBody>;

/** Who is signed in, or the user setup just made an admin. */
export const Me = z.object({ username: z.string(), role: Role }).openapi('Me');
export type Me = z.infer<typeof Me>;

export const UserList = z.object({ users: z.array(Me) }).openapi('UserList');
export type UserList = z.infer<typeof UserList>;

export const LogoutResponse = z.object({ ok: z.boolean() }).openapi('LogoutResponse');
export type LogoutResponse = z.infer<typeof LogoutResponse>;

/** Every refusal: 400, 401, 403 or 404. */
export const ErrorResponse = z.object({ error: z.string() }).openapi('ErrorResponse');
export type ErrorResponse = z.infer<typeof ErrorResponse>;
