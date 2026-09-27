import { z } from './zod.js';

/** The session cookie: an opaque pointer to a session row. */
export const SESSION_COOKIE = 'auralis_session';
/** Which device this browser is, so signing in again reuses it. HttpOnly, not a credential. */
export const DEVICE_COOKIE = 'auralis_device';

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

/** Done: a sign-out, or a device removed. */
export const Ok = z.object({ ok: z.boolean() }).openapi('Ok');
export type Ok = z.infer<typeof Ok>;

export const Service = z.enum(['abs', 'jellyfin']).openapi('Service');
export type Service = z.infer<typeof Service>;

/** Whether this person's own account on an upstream is linked, and why not when it is not. */
export const LinkStatus = z
  .object({
    service: Service,
    state: z.enum(['linked', 'unlinked', 'stale', 'error']).openapi('LinkState'),
    detail: z.string().nullable(),
  })
  .openapi('LinkStatus');
export type LinkStatus = z.infer<typeof LinkStatus>;

/** What GET /auth/me answers: who is signed in, on which device, and their upstream links. */
export const Account = z
  .object({
    username: z.string(),
    role: Role,
    deviceId: z.string(),
    links: z.array(LinkStatus),
  })
  .openapi('Account');
export type Account = z.infer<typeof Account>;

export const ClientKind = z.enum(['web', 'android']).openapi('ClientKind');
export type ClientKind = z.infer<typeof ClientKind>;

/** A base64url string of 43 to 128 characters: a PKCE verifier or its S256 challenge. */
const Pkce = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

/** Where sign-in starts. The app sends its own PKCE challenge and, signing in again, its device. */
export const LoginQuery = z.object({
  client: ClientKind.default('web'),
  return_to: z.string().max(2048).optional(),
  code_challenge: Pkce.optional(),
  device_id: z.string().max(64).optional(),
});

/** Where the sign-on sends the browser back. */
export const CallbackQuery = z.object({
  code: z.string().max(4096).optional(),
  state: z.string().max(256).optional(),
  error: z.string().max(256).optional(),
});

/** The app swaps its one-time code, with the verifier behind its challenge, for a token. */
export const TokenBody = z
  .object({ code: z.string().min(1).max(256), codeVerifier: Pkce })
  .openapi('TokenBody');
export type TokenBody = z.infer<typeof TokenBody>;

/** The app's bearer token; its expiry slides forward on every use. */
export const AppToken = z
  .object({ token: z.string(), deviceId: z.string(), expiresAt: z.number().int() })
  .openapi('AppToken');
export type AppToken = z.infer<typeof AppToken>;

/** A redirect's target; the server answers 302 with it as the Location. */
export const Redirect = z.object({ location: z.string() });
export type Redirect = z.infer<typeof Redirect>;

export const Device = z
  .object({
    id: z.string(),
    kind: ClientKind,
    name: z.string(),
    createdAt: z.number().int(),
    lastSeenAt: z.number().int(),
    /** The device this request came from. */
    current: z.boolean(),
  })
  .openapi('Device');
export type Device = z.infer<typeof Device>;

export const DeviceList = z.object({ devices: z.array(Device) }).openapi('DeviceList');
export type DeviceList = z.infer<typeof DeviceList>;

export const DeviceParams = z.object({ id: z.string().min(1).max(64) });

export const RenameDeviceBody = z
  .object({ name: z.string().trim().min(1).max(64) })
  .openapi('RenameDeviceBody');
export type RenameDeviceBody = z.infer<typeof RenameDeviceBody>;

/** Every refusal: 400, 401, 403, 404 or 429. */
export const ErrorResponse = z.object({ error: z.string() }).openapi('ErrorResponse');
export type ErrorResponse = z.infer<typeof ErrorResponse>;
