/**
 * Mints each person's own Audiobookshelf API key with the admin-level provisioning key, which
 * lives only on mediaserver. ABS 2.36.1 (`ApiKeyController.create`) takes `{name, userId,
 * isActive}`, returns the key once, and resolves every later call to that user. Only root may mint
 * a root user's key, so root accounts are never candidates. The user list cannot say which sign-on
 * subject an account is tied to: even for an admin key, `GET /api/users` and `/api/users/:id`
 * answer `User.toOldJSONForBrowser`, which carries only `hasOpenIDLink`, never `authOpenIDSub`.
 */
import { z } from 'zod';
import { type FetchLike, requestJson } from '../http/fetch.js';
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

  /** Every active account; root and admin accounts are marked admin, so they are never linked. */
  async accounts(): Promise<UpstreamCandidate[]> {
    const { users } = await requestJson(
      this.opts.fetch,
      this.url('api/users'),
      { headers: this.headers },
      absUsersSchema,
    );
    return users
      .filter((u) => u.isActive)
      .map((u) => ({ id: u.id, username: u.username, admin: u.type !== 'user' }));
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
}
