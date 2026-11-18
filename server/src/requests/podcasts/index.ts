/**
 * Podcast requests' steps, when Audiobookshelf and both its keys are here: Auralis's own, which
 * reads the Podcasts library, and the provisioning key, which alone may subscribe. Without them,
 * shows cannot be requested. Nothing here calls an upstream at start. A request walks its whole
 * route in one go (`prompt`): nothing downloads. With the steps comes what Search lists of shows:
 * iTunes' search, one client for the server so every search waits in its one queue, and a pasted
 * feed address read through the same guard the steps read it through.
 */
import { lookup } from 'node:dns/promises';
import { AbsClient } from '../../adapters/audiobookshelf/client.js';
import { AbsProvisioner } from '../../adapters/audiobookshelf/provision.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { type FeedFetch, feedFetch, publicFetch } from '../../adapters/http/publicFetch.js';
import { ITUNES_URL, ItunesClient } from '../../adapters/itunes/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { type ShowCatalogue, showCatalogue } from '../../search/podcasts.js';
import type { AppConfig } from '../../config.js';
import { readSecretFile } from '../../secretFile.js';
import type { Db } from '../../store/connection.js';
import type { MediumSteps } from '../steps.js';
import { podcastImport, podcastSearch } from './steps.js';

export interface PodcastStepsDeps {
  db: Db;
  fetch: FetchLike;
  now: () => number;
  log: JobLog;
  /** How a feed address a client named is read; by default every name is looked up in DNS. */
  feed?: FeedFetch;
}

/** The steps, or which setting keeps shows from being requested. */
export type PodcastSteps = { steps: MediumSteps; catalogue: ShowCatalogue } | { off: string };

/** Every address a name stands for, as the system's resolver answers. */
const addressesOf = async (host: string) =>
  (await lookup(host, { all: true })).map(({ address }) => address);

export function podcastSteps(config: AppConfig, deps: PodcastStepsDeps): PodcastSteps {
  const { abs, index } = config;
  if (abs === null) return { off: 'ABS_URL' };
  if (index.absKeyFile === null) return { off: 'ABS_API_KEY_FILE' };
  let absKey: string;
  let provisionKey: string;
  try {
    absKey = readSecretFile(index.absKeyFile, 'ABS_API_KEY');
    provisionKey = readSecretFile(abs.keyFile, 'ABS_PROVISION_KEY');
  } catch {
    return { off: 'a key their files should hold' };
  }
  const { db, fetch, now, log } = deps;
  const provisioner = new AbsProvisioner({ baseUrl: abs.url, provisionKey, fetch });
  const feed = deps.feed ?? feedFetch({ lookup: addressesOf });
  return {
    catalogue: showCatalogue({
      itunes: new ItunesClient({ baseUrl: ITUNES_URL, fetch }),
      feed,
      fetchArt: publicFetch({ lookup: addressesOf }),
      log,
    }),
    steps: {
      medium: 'podcast',
      prompt: true,
      search: podcastSearch({
        feed,
        provisioner,
      }),
      import: podcastImport({
        db,
        abs: new AbsClient({ baseUrl: abs.url, token: absKey, fetch }),
        provisioner,
        now,
      }),
    },
  };
}
