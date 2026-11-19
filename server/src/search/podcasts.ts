/**
 * What Search lists of podcasts: the shows iTunes' search finds, or the one show a pasted feed
 * address names, and for each the row a person sees. A search waits for iTunes only up to the limit,
 * and anything going wrong is no rows, never a failed search.
 *
 * A pasted feed address is read through the feed guard (`feedFetch`): every hop must resolve to
 * public addresses only, so a private one answers no row, having connected nowhere. Its failure is
 * logged without the address, which a client named.
 *
 * A row names the household's show when the index holds one with its feed or iTunes id; it then
 * says whether the person follows it, as their own library counts it. A cover comes from the
 * address iTunes gave in a search, fetched only from Apple's image hosts, never from a client.
 */
import {
  type MediaRef,
  type RequestIds,
  RequestRef as RequestRefSchema,
  type RequestStatus,
  type SearchShow,
} from '@auralis/schema';
import { readNamedFeed } from '../adapters/feed/client.js';
import type { FetchLike } from '../adapters/http/fetch.js';
import { type FeedFetch, FeedRefused, readCapped } from '../adapters/http/publicFetch.js';
import { type ItunesClient, isItunesArtHost } from '../adapters/itunes/client.js';
import type { JobLog } from '../jobs/schedule.js';
import { personalView } from '../library/personal.js';
import { feedKey, heldShow } from '../requests/podcasts/held.js';
import { requestStanding } from '../requests/standing.js';
import { itunesArtUrl } from '../routes/art.js';
import type { Db } from '../store/connection.js';

const SEARCH_LIMIT_MS = 3_000;
const MOST_KEPT = 500;
const ART_LIMIT_MS = 5_000;
const MAX_ART_BYTES = 2 * 1024 * 1024;
/** What a cover may be: anything else could carry script, which would run on the app's own address. */
const ART_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** A show found for a search: from iTunes, or from a pasted feed, which has no iTunes id or art. */
export interface FoundShow {
  itunesId: string | null;
  title: string;
  host: string | null;
  feedUrl: string;
  episodes: number | null;
  art: string | null;
}

export interface ShowArt {
  type: string;
  bytes: Uint8Array;
}

export interface ShowCatalogue {
  /** The shows iTunes finds for these words; none past the limit, on any failure, or once `gone` aborts. */
  search(q: string, gone: AbortSignal): Promise<FoundShow[]>;
  /** The show a pasted feed address names, once the guard has read its feed; else none. */
  pasted(address: string, gone: AbortSignal): Promise<FoundShow[]>;
  /** A found show's cover, by its iTunes id; null when there is none to give. */
  art(itunesId: string, gone: AbortSignal): Promise<ShowArt | null>;
  /**
   * A request's ids as the server can vouch for them: the iTunes id only when Auralis's own iTunes
   * answer listed it with this feed, so a client cannot pin one show's id on another's feed.
   */
  confirmed(ids: RequestIds): RequestIds;
}

export interface ShowCatalogueDeps {
  itunes: Pick<ItunesClient, 'searchShows' | 'listed'>;
  /** Reads a feed address a client named: `feedFetch` where it runs. */
  feed: FeedFetch;
  /** Asks an address iTunes wrote: `publicFetch` where it runs. */
  fetchArt: FetchLike;
  log: JobLog;
  limitMs?: number;
}

/** Whether a search's text is a feed address to read, not words to search for. */
export function isFeedAddress(q: string): boolean {
  if (!/^https?:\/\//i.test(q)) return false;
  try {
    new URL(q);
    return true;
  } catch {
    return false;
  }
}

/** `found`, or none once the limit passes or `gone` aborts. */
async function within<T>(found: Promise<T[]>, limitMs: number, gone: AbortSignal): Promise<T[]> {
  let timer: NodeJS.Timeout | undefined;
  let stop: () => void = () => undefined;
  // The injected fetch may ignore every signal, so the limit is held here as well.
  const stopped = new Promise<T[]>((resolve) => {
    stop = () => resolve([]);
    timer = setTimeout(stop, limitMs);
    gone.addEventListener('abort', stop, { once: true });
  });
  try {
    return await Promise.race([found, stopped]);
  } finally {
    clearTimeout(timer);
    gone.removeEventListener('abort', stop);
  }
}

export function showCatalogue(deps: ShowCatalogueDeps): ShowCatalogue {
  const { itunes, feed, fetchArt, log } = deps;
  const limitMs = deps.limitMs ?? SEARCH_LIMIT_MS;
  const covers = new Map<string, string>();

  const remember = (itunesId: string, art: string) => {
    covers.delete(itunesId);
    covers.set(itunesId, art);
    const oldest = covers.keys().next().value;
    if (covers.size > MOST_KEPT && oldest !== undefined) covers.delete(oldest);
  };

  return {
    async search(q, gone) {
      const found = itunes.searchShows(q).then((shows) =>
        shows.map((show): FoundShow => {
          if (show.art !== null) remember(show.itunesId, show.art);
          return { ...show };
        }),
      );
      try {
        return await within(found, limitMs, gone);
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no show rows');
        return [];
      }
    },

    async pasted(address, gone) {
      const read = readNamedFeed(feed, address).then(({ feed: show, url }): FoundShow[] =>
        show.title === null
          ? []
          : [
              {
                itunesId: null,
                title: show.title,
                host: null,
                feedUrl: url,
                episodes: show.episodes.length,
                art: null,
              },
            ],
      );
      try {
        return await within(read, limitMs, gone);
      } catch (err) {
        // The address is the client's own: it is never logged.
        const reason =
          err instanceof FeedRefused
            ? err.privateAddress
              ? 'private address'
              : 'refused'
            : 'unread';
        log.error({ reason }, 'no row for a pasted feed');
        return [];
      }
    },

    confirmed({ itunesId, ...ids }) {
      const listed = itunesId === undefined ? null : itunes.listed(itunesId);
      const vouched =
        listed !== null &&
        ids.feedUrl !== undefined &&
        feedKey(listed.feedUrl) === feedKey(ids.feedUrl);
      return vouched ? { ...ids, itunesId } : ids;
    },

    async art(itunesId, gone) {
      const address = covers.get(itunesId);
      if (address === undefined || !isItunesArtHost(new URL(address).hostname)) return null;
      try {
        const response = await fetchArt(address, {
          redirect: 'manual',
          signal: AbortSignal.any([gone, AbortSignal.timeout(ART_LIMIT_MS)]),
        });
        const type = (response.headers.get('content-type') ?? '')
          .split(';')[0]!
          .trim()
          .toLowerCase();
        if (!response.ok || !ART_TYPES.has(type)) {
          await response.body?.cancel();
          return null;
        }
        const bytes = await readCapped(response, MAX_ART_BYTES);
        return bytes === null ? null : { type, bytes };
      } catch (err) {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'no show cover');
        return null;
      }
    },
  };
}

/** The rows a person sees for the shows found, in their order; one a request cannot take is left out. */
export function showRows(db: Db, userId: string, shows: readonly FoundShow[]): SearchShow[] {
  if (shows.length === 0) return [];
  const view = personalView(db, userId);
  return shows.flatMap((show) => {
    const ids = {
      feedUrl: show.feedUrl,
      ...(show.itunesId === null ? {} : { itunesId: show.itunesId }),
    };
    const ref = RequestRefSchema.safeParse({
      medium: 'podcast',
      target: { title: show.title, creator: show.host, ids },
    });
    if (!ref.success) return [];
    const held = heldShow(db, ids);
    let status: RequestStatus | null = 'inLibrary';
    let item: MediaRef | null = held;
    if (held === null) {
      const standing = requestStanding(db, userId, ref.data, false);
      status = standing === null || standing === 'owned' ? null : standing.status;
      item = standing === null || standing === 'owned' ? null : standing.item;
    }
    return [
      {
        ref: ref.data,
        title: show.title,
        host: show.host,
        episodes: show.episodes,
        art: show.itunesId === null || show.art === null ? null : itunesArtUrl(show.itunesId),
        status,
        item,
        following: item !== null && view.holds(item),
      },
    ];
  });
}
