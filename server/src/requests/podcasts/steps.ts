/**
 * A podcast request's steps: subscribing the household to a show it lacks. Nothing downloads.
 *
 * - `search` reads the feed address the request names through Auralis's own guarded fetch, which
 *   refuses any hop off the public internet and follows redirects by hand; then asks Audiobookshelf
 *   to read the address it ended at, as the provisioning key (only an admin may). A refused address
 *   fails as `privateAddress` before Audiobookshelf hears it. One Audiobookshelf could not read
 *   after Auralis could fails the same only when the guard, reading it again, now finds it private:
 *   Audiobookshelf's own filter refuses such an address (recorded), but answers the same 404 for
 *   any failed read, so otherwise it is held as away.
 * - `import` makes the show in the one Podcasts library's folder, auto-download off and checked on
 *   the hour as every household show, then indexes it. With no Podcasts library it fails
 *   `noPodcastLibrary`, making nothing.
 *
 * A repeated import must make nothing twice, and a stop between Audiobookshelf making the show and
 * Auralis saving the answer leaves a show Auralis never heard of. So the import first looks in the
 * index for a show with this feed address or iTunes id, and answers with it when there is one. When
 * Audiobookshelf says an item sits at the path already, that item may be this request's own lost
 * show, not yet indexed: the import waits for a whole index pass begun since the request was last
 * saved, which finds it by its feed if it is, and only then tries the next path.
 */
import { z } from 'zod';
import type { AbsClient } from '../../adapters/audiobookshelf/client.js';
import {
  type AbsProvisioner,
  absPodcastFeedSchema,
  newPodcastMetadata,
} from '../../adapters/audiobookshelf/provision.js';
import { readNamedFeed } from '../../adapters/feed/client.js';
import { AdapterError } from '../../adapters/http/fetch.js';
import { type FeedFetch, FeedRefused } from '../../adapters/http/publicFetch.js';
import { indexOneAbsItem } from '../../libraryIndex/job.js';
import { absIndexedSince } from '../../libraryIndex/store.js';
import type { Db } from '../../store/connection.js';
import type { StoredRequest } from '../../store/requests.js';
import { type ImportOutcome, type SearchOutcome, StepUnavailable } from '../steps.js';
import { heldShow } from './held.js';
import { PODCAST_SCHEDULE, podcastPaths } from './place.js';

/** What a podcast's one release keeps: the address read, and the show as Audiobookshelf read it. */
const PodcastDetails = z.object({
  feedUrl: z.string().url(),
  show: absPodcastFeedSchema.shape.podcast.shape.metadata,
});

/** Whether an upstream's failure says it is away, not that the request is wrong. */
const away = (error: unknown) =>
  !(error instanceof AdapterError) ||
  error.kind === 'timeout' ||
  error.kind === 'network' ||
  (error.status !== undefined && error.status >= 500);

export interface PodcastSearchDeps {
  feed: FeedFetch;
  provisioner: Pick<AbsProvisioner, 'podcastFeed'>;
}

export function podcastSearch({ feed, provisioner }: PodcastSearchDeps) {
  return async (request: StoredRequest): Promise<SearchOutcome> => {
    const address = request.target.ids.feedUrl;
    if (address === undefined) return { kind: 'none', reason: 'noRelease' };
    let url: string;
    try {
      ({ url } = await readNamedFeed(feed, address));
    } catch (error) {
      if (error instanceof FeedRefused) {
        return { kind: 'none', reason: error.privateAddress ? 'privateAddress' : 'noRelease' };
      }
      if (away(error)) throw new StepUnavailable('the feed could not be reached', { cause: error });
      return { kind: 'none', reason: 'noRelease' };
    }
    let show;
    try {
      show = await provisioner.podcastFeed(url);
    } catch (error) {
      if (away(error)) throw new StepUnavailable('Audiobookshelf is away', { cause: error });
      throw error;
    }
    if (show === null) return couldNotRead(feed, url);
    const release = {
      id: 'feed',
      title: show.title,
      source: 'Podcast feed',
      size: null,
      details: { feedUrl: url, show },
    };
    return { kind: 'picked', release, others: [] };
  };
}

/**
 * Audiobookshelf answers one 404 for any feed it could not read: its filter refusing a private
 * address, or the host failing it a moment after Auralis read it. The guard reads the address again
 * to tell them apart: private now, the request fails; still public, Audiobookshelf is held as away.
 */
async function couldNotRead(feed: FeedFetch, url: string): Promise<SearchOutcome> {
  try {
    await readNamedFeed(feed, url);
  } catch (error) {
    if (error instanceof FeedRefused && error.privateAddress) {
      return { kind: 'none', reason: 'privateAddress' };
    }
  }
  throw new StepUnavailable('Audiobookshelf could not read the feed');
}

export interface PodcastImportDeps {
  db: Db;
  /** Auralis's own key, which reads the Podcasts library. */
  abs: Pick<AbsClient, 'getLibraries' | 'getItemSummary'>;
  provisioner: Pick<AbsProvisioner, 'createPodcast'>;
  now: () => number;
}

export function podcastImport({ db, abs, provisioner, now }: PodcastImportDeps) {
  return async (request: StoredRequest): Promise<ImportOutcome> => {
    const details = PodcastDetails.safeParse(request.release?.details);
    if (!details.success) return { kind: 'failed', reason: 'importFailed' };
    const { feedUrl, show } = details.data;
    const { ids } = request.target;
    const held = heldShow(db, ids) ?? heldShow(db, { feedUrl });
    if (held !== null) return { kind: 'arrived', ref: held };
    const libraries = (await abs.getLibraries()).filter(({ mediaType }) => mediaType === 'podcast');
    if (libraries.length === 0) return { kind: 'failed', reason: 'noPodcastLibrary' };
    const folder = libraries.length === 1 ? libraries[0]!.folders?.[0] : undefined;
    if (folder?.id === undefined) return { kind: 'failed', reason: 'importFailed' };
    const folderId = folder.id;
    const itunesId = ids.itunesId ?? null;
    for (const path of podcastPaths(folder.fullPath, show.title)) {
      const made = await provisioner.createPodcast({
        libraryId: libraries[0]!.id,
        folderId,
        path,
        media: {
          metadata: newPodcastMetadata(show, { feedUrl, itunesId }),
          autoDownloadEpisodes: false,
          autoDownloadSchedule: PODCAST_SCHEDULE,
        },
      });
      if (made === 'exists') {
        if (absIndexedSince(db, request.updatedAt)) continue;
        return { kind: 'waiting' };
      }
      await indexOneAbsItem(db, abs, made.id, now());
      return { kind: 'arrived', ref: { source: 'abs', id: made.id } };
    }
    return { kind: 'failed', reason: 'importFailed' };
  };
}
