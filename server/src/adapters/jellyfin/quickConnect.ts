/**
 * Mints each person's own Jellyfin session without their password. Jellyfin 10.11.11 gives an
 * API-key caller the Administrator role (`CustomAuthenticationHandler`), and
 * `QuickConnectController.Authorize(code, userId)` lets an administrator approve a Quick Connect
 * request for another user. So: initiate as the person's Auralis device, authorize it for their
 * Jellyfin user with the API key, then swap the secret for their `AccessToken`. A second mint for
 * the same device replaces the old token rather than adding one.
 */
import { z } from 'zod';
import { type FetchLike, requestJson } from '../http/fetch.js';
import { type UpstreamCandidate } from '../../upstream/mapping.js';
import { buildAuthorizationHeader, type JellyfinDeviceInfo } from './auth.js';

export const jellyfinUsersSchema = z.array(
  z.object({
    Id: z.string(),
    Name: z.string(),
    Policy: z.object({ IsDisabled: z.boolean() }).partial().optional(),
  }),
);

export const quickConnectResultSchema = z.object({ Secret: z.string().min(1), Code: z.string() });
export const quickConnectAuthorizedSchema = z.literal(true);
export const authenticationResultSchema = z.object({
  AccessToken: z.string().min(1),
  User: z.object({ Id: z.string() }),
});

/** The device each person's Jellyfin token belongs to; every call with it sends the same. */
export function personDevice(auralisUserId: string): JellyfinDeviceInfo {
  return {
    client: 'Auralis',
    device: 'Auralis',
    deviceId: `auralis-${auralisUserId}`,
    version: '0.0.0',
  };
}

export interface JellyfinProvisionerOptions {
  baseUrl: string;
  apiKey: string;
  fetch: FetchLike;
}

export class JellyfinProvisioner {
  readonly service = 'jellyfin' as const;

  constructor(private readonly opts: JellyfinProvisionerOptions) {}

  private url(path: string, query: Record<string, string> = {}): string {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url.toString();
  }

  private asServer() {
    const server: JellyfinDeviceInfo = {
      client: 'Auralis',
      device: 'Auralis server',
      deviceId: 'auralis-server',
      version: '0.0.0',
    };
    return { authorization: buildAuthorizationHeader(server, this.opts.apiKey) };
  }

  /** Every account that is not disabled. */
  async accounts(): Promise<UpstreamCandidate[]> {
    const users = await requestJson(
      this.opts.fetch,
      this.url('Users'),
      { headers: this.asServer() },
      jellyfinUsersSchema,
    );
    return users
      .filter((u) => u.Policy?.IsDisabled !== true)
      .map((u) => ({ id: u.Id, username: u.Name }));
  }

  async mint(upstreamUserId: string, auralisUserId: string): Promise<{ token: string }> {
    const { Secret, Code } = await this.initiate(auralisUserId);
    await this.authorize(Code, upstreamUserId);
    return this.authenticate(Secret, auralisUserId, upstreamUserId);
  }

  /** A Quick Connect request from the person's Auralis device. */
  initiate(auralisUserId: string) {
    return requestJson(
      this.opts.fetch,
      this.url('QuickConnect/Initiate'),
      { method: 'POST', headers: this.asPerson(auralisUserId) },
      quickConnectResultSchema,
    );
  }

  /** Approves the request for their Jellyfin user, as the API key. */
  async authorize(code: string, upstreamUserId: string): Promise<void> {
    await requestJson(
      this.opts.fetch,
      this.url('QuickConnect/Authorize', { code, userId: upstreamUserId }),
      { method: 'POST', headers: this.asServer() },
      quickConnectAuthorizedSchema,
    );
  }

  /** Swaps the approved request's secret for their own access token. */
  async authenticate(
    secret: string,
    auralisUserId: string,
    upstreamUserId: string,
  ): Promise<{ token: string }> {
    const result = await requestJson(
      this.opts.fetch,
      this.url('Users/AuthenticateWithQuickConnect'),
      { method: 'POST', headers: this.asPerson(auralisUserId), json: { Secret: secret } },
      authenticationResultSchema,
    );
    // A Guid may come back with or without dashes.
    const same = (a: string, b: string) =>
      a.replace(/-/g, '').toLowerCase() === b.replace(/-/g, '').toLowerCase();
    if (!same(result.User.Id, upstreamUserId)) throw new Error('the session is for another user');
    return { token: result.AccessToken };
  }

  private asPerson(auralisUserId: string) {
    return { authorization: buildAuthorizationHeader(personDevice(auralisUserId)) };
  }
}
