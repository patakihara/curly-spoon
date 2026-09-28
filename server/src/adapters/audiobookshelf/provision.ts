/**
 * Mints each person's own Audiobookshelf API key with the admin-level provisioning key, which
 * lives only on mediaserver. ABS 2.36.1 (`ApiKeyController.create`) takes `{name, userId,
 * isActive}`, returns the key once, and resolves every later call to that user. Only root may mint
 * a root user's key, so root accounts are never candidates. The user list cannot say which sign-on
 * subject an account is tied to: even for an admin key, `GET /api/users` and `/api/users/:id`
 * answer `User.toOldJSONForBrowser`, which carries only `hasOpenIDLink`, never `authOpenIDSub`.
 *
 * A household member with no account gets one: `UserController.create` takes `{username,
 * password, type, isActive, permissions}` and answers `{user}`. The password is random and never
 * kept; nobody signs in with it, since their own API key is Auralis's credential.
 */
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import { type UpstreamCandidate } from '../../upstream/mapping.js';

export const absUsersSchema = z.object({
  users: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      type: z.string(),
      isActive: z.boolean(),
    }),
  ),
});

export const absUserCreatedSchema = z.object({
  user: z.object({ id: z.string(), username: z.string(), type: z.literal('user') }),
});

/**
 * ABS's own defaults for a new `user` (`User.getDefaultPermissionsForUserType`), except download,
 * which is off: the account streams every library and changes nothing.
 */
export const CREATED_USER_PERMISSIONS = {
  download: false,
  update: false,
  delete: false,
  upload: false,
  createEreader: false,
  accessAllLibraries: true,
  accessAllTags: true,
  accessExplicitContent: false,
  selectedTagsNotAccessible: false,
} as const;

export const absApiKeyCreatedSchema = z.object({
  apiKey: z.object({ id: z.string(), apiKey: z.string().min(1), userId: z.string() }),
});

export const KEY_NAME = 'Auralis';

export interface AbsProvisionerOptions {
  baseUrl: string;
  provisionKey: string;
  fetch: FetchLike;
}

export class AbsProvisioner {
  readonly service = 'abs' as const;

  constructor(private readonly opts: AbsProvisionerOptions) {}

  private url(path: string): string {
    const base = this.opts.baseUrl.endsWith('/') ? this.opts.baseUrl : `${this.opts.baseUrl}/`;
    return new URL(path, base).toString();
  }

  private get headers() {
    return { authorization: `Bearer ${this.opts.provisionKey}` };
  }

  /**
   * Every account. Root is marked, because this key cannot mint a key for it; so is an inactive
   * one, which is never linked and still stops a new account being made in its name.
   */
  async accounts(): Promise<UpstreamCandidate[]> {
    const { users } = await requestJson(
      this.opts.fetch,
      this.url('api/users'),
      { headers: this.headers },
      absUsersSchema,
    );
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      root: u.type === 'root',
      ...(u.isActive ? {} : { disabled: true }),
    }));
  }

  /** Creates a listening user named `username`, with a password nobody keeps; returns its id. */
  async create(username: string): Promise<string> {
    const { user } = await requestJson(
      this.opts.fetch,
      this.url('api/users'),
      {
        method: 'POST',
        headers: this.headers,
        json: {
          username,
          password: randomBytes(32).toString('base64url'),
          type: 'user',
          isActive: true,
          permissions: CREATED_USER_PERMISSIONS,
        },
      },
      absUserCreatedSchema,
    );
    if (user.username !== username) throw new Error('the account was created under another name');
    return user.id;
  }

  /** A key that never expires, acting as `upstreamUserId`. */
  async mint(upstreamUserId: string): Promise<{ token: string; keyId: string }> {
    const { apiKey } = await requestJson(
      this.opts.fetch,
      this.url('api/api-keys'),
      {
        method: 'POST',
        headers: this.headers,
        json: { name: KEY_NAME, userId: upstreamUserId, isActive: true },
      },
      absApiKeyCreatedSchema,
    );
    if (apiKey.userId !== upstreamUserId) throw new Error('the key was minted for another user');
    return { token: apiKey.apiKey, keyId: apiKey.id };
  }

  /** Deletes a key, as the provisioning key; one that is already gone is fine. */
  async revoke(keyId: string): Promise<void> {
    const call = 'DELETE api/api-keys';
    const response = await this.opts.fetch(this.url(`api/api-keys/${encodeURIComponent(keyId)}`), {
      method: 'DELETE',
      headers: this.headers,
    });
    if (!response.ok && response.status !== 404) {
      throw new AdapterError('status', call, `answered ${response.status}`, response.status);
    }
  }
}
