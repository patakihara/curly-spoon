/**
 * Book requests' steps, when everything they need is here: Prowlarr, qBittorrent, Audiobookshelf,
 * their keys, and the folder holding Books and Downloads. With any of it missing, books cannot be
 * requested and the rest of the server runs as ever. Nothing here calls an upstream: one that is down
 * holds a request later, and never reaches the start of the server or its health.
 */
import { lookup } from 'node:dns/promises';
import { join } from 'node:path';
import { AudibleClient } from '../../adapters/audible/client.js';
import { AbsClient } from '../../adapters/audiobookshelf/client.js';
import { AbsProvisioner } from '../../adapters/audiobookshelf/provision.js';
import { AudnexusClient } from '../../adapters/audnexus/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { publicFetch } from '../../adapters/http/publicFetch.js';
import { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { AppConfig } from '../../config.js';
import type { JobLog } from '../../jobs/schedule.js';
import { readSecretFile } from '../../secretFile.js';
import type { Db } from '../../store/connection.js';
import { torrentDownload } from '../download/torrent.js';
import { folderLacking } from '../folder.js';
import type { SharedProwlarr } from '../prowlarr.js';
import type { MediumSteps } from '../steps.js';
import { bookCatalogue, type BookCatalogue } from './catalogue.js';
import { bookImport } from './import.js';
import { bookSearch } from './search.js';

/** Books' own qBittorrent category. */
export const BOOKS_CATEGORY = 'auralis-books';

export interface BookStepsDeps {
  db: Db;
  fetch: FetchLike;
  log: JobLog;
  now: () => number;
  /** The server's one Prowlarr, which albums share; null when it is not set up or has no key. */
  prowlarr: SharedProwlarr | null;
}

/** The steps, or which setting keeps books from being requested. */
export type BookSteps = { steps: MediumSteps; catalogue: BookCatalogue } | { off: string };

const addressesOf = async (host: string) =>
  (await lookup(host, { all: true })).map(({ address }) => address);

export function bookSteps(config: AppConfig, deps: BookStepsDeps): BookSteps {
  const { abs, index, books } = config;
  const { db, fetch, log, now, prowlarr } = deps;
  if (abs === null) return { off: 'ABS_URL' };
  if (index.absKeyFile === null) return { off: 'ABS_API_KEY_FILE' };
  if (books.prowlarr === null) return { off: 'PROWLARR_URL and PROWLARR_API_KEY_FILE' };
  if (books.qbittorrent === null) return { off: 'QBITTORRENT_URL and QBITTORRENT_API_KEY_FILE' };
  if (books.downloadsPath === null) return { off: 'QBITTORRENT_DOWNLOADS_PATH' };
  if (books.mediaDir === null) return { off: 'MEDIA_DIR' };
  const { mediaDir, downloadsPath } = books;
  const lacking = folderLacking(join(mediaDir, 'Books'), 'Books');
  if (lacking !== null) return { off: lacking };

  if (prowlarr === null) return { off: 'a key their files should hold' };
  const secrets = [
    [books.qbittorrent.keyFile, 'QBITTORRENT_API_KEY'],
    [index.absKeyFile, 'ABS_API_KEY'],
    [abs.keyFile, 'ABS_PROVISION_KEY'],
  ] as const;
  let keys: string[];
  try {
    keys = secrets.map(([file, name]) => readSecretFile(file, name));
  } catch {
    return { off: 'a key their files should hold' };
  }
  const [qbittorrentKey, absKey, provisionKey] = keys as [string, string, string];

  const qbittorrent = new QbittorrentClient({
    baseUrl: books.qbittorrent.url,
    apiKey: qbittorrentKey,
    fetch,
  });
  // Without Audible no book is found or searched for; without Audnexus it only lacks a photo.
  const audible =
    books.audibleUrl === null
      ? { product: async () => null, search: async () => [] }
      : new AudibleClient({ baseUrl: books.audibleUrl, fetch });
  const audnexus =
    books.audnexusUrl === null
      ? { author: async () => null, authorsNamed: async () => [] }
      : new AudnexusClient({ baseUrl: books.audnexusUrl, fetch });

  const photoFetch = publicFetch({ lookup: addressesOf });

  return {
    catalogue: bookCatalogue({ audible, fetchArt: photoFetch, now, log }),
    steps: {
      medium: 'book',
      search: bookSearch({ audible, prowlarr, fetch, log }),
      download: torrentDownload({ category: BOOKS_CATEGORY, qbittorrent, prowlarr, now, log }),
      import: bookImport({
        audible,
        audnexus,
        qbittorrent,
        abs: new AbsClient({ baseUrl: abs.url, token: absKey, fetch }),
        provisioner: new AbsProvisioner({ baseUrl: abs.url, provisionKey, fetch }),
        db,
        mediaDir,
        downloadsPath,
        photoFetch,
        now,
        log,
      }),
    },
  };
}
