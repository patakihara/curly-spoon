/**
 * Links each person to their own upstream accounts at sign-in, and builds the clients that act as
 * them. A link failure is stored on the link and never blocks sign-in. The upstream account is
 * pinned at first link; a stale token is re-minted for the same account, never re-matched.
 * `upstreamFor` decrypts per request: nothing is cached across users.
 */
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { AdapterError, type FetchLike } from '../adapters/http/fetch.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { personDevice } from '../adapters/jellyfin/quickConnect.js';
import type { Db } from '../store/connection.js';
import {
  getLink,
  markLink,
  readToken,
  saveLink,
  type Service,
  UpstreamAccountTaken,
} from '../store/upstreamLinks.js';
import type { User } from '../store/users.js';
import { pickUpstreamUser, type UpstreamCandidate } from './mapping.js';

/** One upstream's way of finding accounts and minting a token that acts as one of them. */
export interface Provisioner {
  readonly service: Service;
  accounts(): Promise<UpstreamCandidate[]>;
  mint(upstreamUserId: string, auralisUserId: string): Promise<{ token: string; keyId?: string }>;
}

/** What a failure says on the link: the call and status, never a header or a body. */
function failureDetail(error: unknown): string {
  if (error instanceof AdapterError) return error.message.slice(0, 200);
  return error instanceof Error ? error.message.slice(0, 200) : 'failed';
}

export interface LinkerOptions {
  db: Db;
  key: Buffer;
  provisioners: readonly Provisioner[];
  now?: () => number;
}

export class Linker {
  private readonly now: () => number;

  constructor(private readonly opts: LinkerOptions) {
    this.now = opts.now ?? Date.now;
  }

  /** Links every service this user has no working link to. Never throws. */
  async linkAll(user: User): Promise<void> {
    for (const provisioner of this.opts.provisioners) {
      const link = getLink(this.opts.db, user.id, provisioner.service);
      if (link?.state === 'linked' && link.hasToken) continue;
      await this.link(user, provisioner, link?.upstreamUserId ?? null);
    }
  }

  /** Mints a new token for the pinned account after the old one was refused. */
  async remint(user: User, service: Service): Promise<boolean> {
    const provisioner = this.opts.provisioners.find((p) => p.service === service);
    const pinned = getLink(this.opts.db, user.id, service)?.upstreamUserId ?? null;
    if (provisioner === undefined || pinned === null) return false;
    await this.link(user, provisioner, pinned);
    return getLink(this.opts.db, user.id, service)?.state === 'linked';
  }

  private async link(user: User, provisioner: Provisioner, pinned: string | null) {
    const { db, key } = this.opts;
    const { service } = provisioner;
    let upstreamUserId = pinned;
    try {
      if (upstreamUserId === null) {
        const pick = pickUpstreamUser(await provisioner.accounts(), user.username);
        if (pick.state === 'unlinked') {
          saveLink(
            db,
            key,
            { userId: user.id, service, upstreamUserId: null, token: null, ...pick },
            this.now(),
          );
          return;
        }
        upstreamUserId = pick.id;
      }
      // Refuse an account someone else holds before minting anything for it.
      saveLink(db, key, { userId: user.id, service, upstreamUserId, token: null, state: 'stale' });
      const minted = await provisioner.mint(upstreamUserId, user.id);
      saveLink(
        db,
        key,
        {
          userId: user.id,
          service,
          upstreamUserId,
          token: minted.token,
          upstreamKeyId: minted.keyId ?? null,
          state: 'linked',
        },
        this.now(),
      );
    } catch (error) {
      const taken = error instanceof UpstreamAccountTaken;
      saveLink(
        db,
        key,
        {
          userId: user.id,
          service,
          upstreamUserId: taken ? null : upstreamUserId,
          token: null,
          state: taken ? 'unlinked' : 'error',
          detail: taken ? 'account_taken' : failureDetail(error),
        },
        this.now(),
      );
    }
  }
}

export interface UpstreamConfig {
  absUrl: string | undefined;
  jellyfinUrl: string | undefined;
}

export interface Upstreams {
  abs: AbsClient | null;
  jellyfin: JellyfinClient | null;
}

/**
 * This person's own clients: each call carries their token and nobody else's. A 401 marks the
 * link stale and, with a linker, re-mints once and retries.
 */
export function upstreamFor(
  options: { db: Db; key: Buffer; config: UpstreamConfig; fetch: FetchLike; linker?: Linker },
  user: User,
): Upstreams {
  const { db, key, config } = options;

  const clientFetch =
    (service: Service, withToken: (token: string, init?: RequestInit) => RequestInit): FetchLike =>
    async (url, init) => {
      const response = await options.fetch(url, init);
      if (response.status !== 401) return response;
      markLink(db, user.id, service, 'stale', 'the token was refused');
      if (options.linker === undefined || !(await options.linker.remint(user, service))) {
        return response;
      }
      const fresh = readToken(db, key, user.id, service);
      return fresh === null ? response : options.fetch(url, withToken(fresh, init));
    };

  const tokenOf = (service: Service) => {
    const link = getLink(db, user.id, service);
    return link?.state === 'linked' ? readToken(db, key, user.id, service) : null;
  };

  const absToken = config.absUrl === undefined ? null : tokenOf('abs');
  const jellyfinToken = config.jellyfinUrl === undefined ? null : tokenOf('jellyfin');
  const device = personDevice(user.id);

  return {
    abs:
      absToken === null || config.absUrl === undefined
        ? null
        : new AbsClient({
            baseUrl: config.absUrl,
            token: absToken,
            fetch: clientFetch('abs', (token, init) => ({
              ...init,
              headers: {
                ...(init?.headers as Record<string, string>),
                authorization: `Bearer ${token}`,
              },
            })),
          }),
    jellyfin:
      jellyfinToken === null || config.jellyfinUrl === undefined
        ? null
        : new JellyfinClient({
            baseUrl: config.jellyfinUrl,
            token: jellyfinToken,
            device,
            fetch: clientFetch('jellyfin', (token, init) => {
              const headers = { ...(init?.headers as Record<string, string>) };
              headers.authorization = (headers.authorization ?? '').replace(
                /Token="[^"]*"/,
                `Token="${token.replace(/"/g, '')}"`,
              );
              return { ...init, headers };
            }),
          }),
  };
}
