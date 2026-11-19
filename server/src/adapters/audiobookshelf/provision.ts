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

/**
 * `POST /api/podcasts/feed {rssFeed}` (ABS 2.37.2, admin only): Audiobookshelf fetches and parses
 * the feed itself, through its own private-address filter, and answers the show (recorded). Only
 * what its web app carries into a new show is read.
 */
const text = z.string().nullish().catch(null);
export const absPodcastFeedSchema = z.object({
  podcast: z.object({
    metadata: z
      .object({
        title: z.string().trim().min(1),
        author: text,
        descriptionPlain: text,
        categories: z.array(z.string()).nullish().catch(null),
        image: text,
        language: text,
        type: text,
        explicit: z.union([z.string(), z.boolean()]).nullish().catch(null),
      })
      .passthrough(),
  }),
});
export type AbsPodcastFeed = z.infer<typeof absPodcastFeedSchema>['podcast']['metadata'];

/** A new show's metadata, as `POST /api/podcasts` takes it. */
export interface NewPodcastMetadata {
  title: string;
  author: string;
  description: string;
  genres: string[];
  feedUrl: string;
  imageUrl: string;
  itunesId: string;
  language: string;
  explicit: boolean;
  type: string;
}

/**
 * A show's metadata from its feed as Audiobookshelf read it, as ABS's own web app fills it
 * (`NewModal.vue`'s `init`), with the feed address read and its iTunes id when known.
 */
export function newPodcastMetadata(
  feed: AbsPodcastFeed,
  { feedUrl, itunesId }: { feedUrl: string; itunesId: string | null },
): NewPodcastMetadata {
  return {
    title: feed.title,
    author: feed.author ?? '',
    description: feed.descriptionPlain ?? '',
    genres: feed.categories ?? [],
    feedUrl,
    imageUrl: feed.image ?? '',
    itunesId: itunesId ?? '',
    language: feed.language ?? '',
    explicit: feed.explicit === true || feed.explicit === 'yes' || feed.explicit === 'true',
    type: feed.type ?? 'episodic',
  };
}

/** `POST /api/podcasts`: the library item made for the show. */
export const absPodcastCreatedSchema = z.object({ id: z.string().min(1) }).passthrough();

/** What `POST /api/podcasts` takes: the library, its folder, the show's folder, and its media. */
export interface NewPodcast {
  libraryId: string;
  folderId: string;
  path: string;
  media: {
    metadata: NewPodcastMetadata;
    autoDownloadEpisodes: boolean;
    autoDownloadSchedule: string;
  };
}

/** ABS's answer, word for word, when an item already sits at the path (recorded, 400). */
export const PODCAST_EXISTS = 'Podcast already exists';

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

  /**
   * Gives an author a photo: Audiobookshelf fetches `url` itself and stores it under its own
   * metadata, as `author.jpg` in a Books folder never reaches it. It needs the provisioning key,
   * as a listening key may not update.
   */
  async setAuthorImage(authorId: string, url: string): Promise<void> {
    await requestJson(
      this.opts.fetch,
      this.url(`api/authors/${encodeURIComponent(authorId)}/image`),
      { method: 'POST', headers: this.headers, json: { url } },
      z.unknown(),
    );
  }

  /**
   * The show a feed holds, as Audiobookshelf reads it; null when it could not (recorded: 404 for a
   * feed that is not RSS, and for one its private-address filter refuses).
   */
  async podcastFeed(rssFeed: string): Promise<AbsPodcastFeed | null> {
    try {
      const { podcast } = await requestJson(
        this.opts.fetch,
        this.url('api/podcasts/feed'),
        { method: 'POST', headers: this.headers, json: { rssFeed } },
        absPodcastFeedSchema,
      );
      return podcast.metadata;
    } catch (error) {
      if (error instanceof AdapterError && error.status === 404) return null;
      throw error;
    }
  }

  /**
   * Makes the show's library item in its own folder, as ABS's web app does; ABS downloads its
   * cover there and no episode. `exists` when an item already sits at that path (recorded).
   */
  async createPodcast(podcast: NewPodcast): Promise<{ id: string } | 'exists'> {
    const call = 'POST api/podcasts';
    const response = await this.opts.fetch(this.url('api/podcasts'), {
      method: 'POST',
      headers: { ...this.headers, 'content-type': 'application/json' },
      body: JSON.stringify(podcast),
    });
    if (response.status === 400 && (await response.text()).trim() === PODCAST_EXISTS) {
      return 'exists';
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AdapterError('status', call, `answered ${response.status}`, response.status);
    }
    const parsed = absPodcastCreatedSchema.safeParse(await response.json());
    if (!parsed.success) throw new AdapterError('parse', call, 'not a library item');
    return { id: parsed.data.id };
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
