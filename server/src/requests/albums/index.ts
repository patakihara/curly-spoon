/**
 * Album requests' steps, when everything they need is here: Prowlarr and qBittorrent with their keys,
 * where qBittorrent sees Downloads, a Music folder in MEDIA_DIR, Jellyfin and its key, and MusicBrainz,
 * whose release group names the album. With any of it missing, albums cannot be requested and the
 * rest of the server runs as ever. The Cover Art Archive is optional: without it an album takes the
 * torrent's own cover or none, and Search's rows show none. Nothing here calls an upstream: one that
 * is down holds a request later, and never reaches the start of the server or its health.
 *
 * Search's album rows come with the steps, so a row is listed only while its tap can be taken.
 */
import { join } from 'node:path';
import { CoverArtClient } from '../../adapters/coverart/client.js';
import type { FetchLike } from '../../adapters/http/fetch.js';
import { JellyfinClient } from '../../adapters/jellyfin/client.js';
import type { MusicBrainzClient } from '../../adapters/musicbrainz/client.js';
import { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { AppConfig } from '../../config.js';
import type { JobLog } from '../../jobs/schedule.js';
import { readSecretFile } from '../../secretFile.js';
import type { Db } from '../../store/connection.js';
import { folderLacking } from '../folder.js';
import type { MediumSteps } from '../steps.js';
import { albumCatalogue, type AlbumCatalogue } from './catalogue.js';
import { albumDownload } from './download.js';
import { AlbumEditions } from './editions.js';
import { albumImport } from './import.js';
import { ProwlarrCache } from './prowlarrCache.js';
import type { JellyfinPerson } from './replace.js';
import { albumSearch } from './search.js';
import type { SharedProwlarr } from '../prowlarr.js';

export interface AlbumStepsDeps {
  db: Db;
  fetch: FetchLike;
  log: JobLog;
  now: () => number;
  /** Everyone linked on Jellyfin, each with a client acting as them; asked only by an import. */
  people: () => JellyfinPerson[];
  /** The server's one MusicBrainz client, which songs share; null with MusicBrainz switched off. */
  musicBrainz: MusicBrainzClient | null;
  /** The server's one Prowlarr, which books share; null when it is not set up or has no key. */
  prowlarr: SharedProwlarr | null;
}

/** The steps with Search's catalogue, or which setting keeps albums from being requested. */
export type AlbumSteps = { steps: MediumSteps; catalogue: AlbumCatalogue } | { off: string };

export function albumSteps(config: AppConfig, deps: AlbumStepsDeps): AlbumSteps {
  const { books, jellyfin, songs } = config;
  const { db, fetch, log, now, people, musicBrainz, prowlarr } = deps;
  if (books.prowlarr === null) return { off: 'PROWLARR_URL and PROWLARR_API_KEY_FILE' };
  if (books.qbittorrent === null) return { off: 'QBITTORRENT_URL and QBITTORRENT_API_KEY_FILE' };
  if (books.downloadsPath === null) return { off: 'QBITTORRENT_DOWNLOADS_PATH' };
  if (books.mediaDir === null) return { off: 'MEDIA_DIR' };
  if (jellyfin === null) return { off: 'JELLYFIN_URL and JELLYFIN_API_KEY_FILE' };
  if (musicBrainz === null) return { off: 'MUSICBRAINZ_URL' };
  const { mediaDir, downloadsPath } = books;
  const lacking = folderLacking(join(mediaDir, 'Music'), 'Music');
  if (lacking !== null) return { off: lacking };

  if (prowlarr === null) return { off: 'a key their files should hold' };
  const secrets = [
    [books.qbittorrent.keyFile, 'QBITTORRENT_API_KEY'],
    [jellyfin.keyFile, 'JELLYFIN_API_KEY'],
  ] as const;
  let keys: string[];
  try {
    keys = secrets.map(([file, name]) => readSecretFile(file, name));
  } catch {
    return { off: 'a key their files should hold' };
  }
  const [qbittorrentKey, jellyfinKey] = keys as [string, string];

  const qbittorrent = new QbittorrentClient({
    baseUrl: books.qbittorrent.url,
    apiKey: qbittorrentKey,
    fetch,
  });
  const coverArt =
    songs.coverArtUrl === null ? null : new CoverArtClient({ baseUrl: songs.coverArtUrl, fetch });
  const editions = new AlbumEditions({ db, musicBrainz, now });

  return {
    catalogue: albumCatalogue({ musicBrainz, coverArt, now, log }),
    steps: {
      medium: 'album',
      search: albumSearch({
        db,
        editions,
        prowlarr: new ProwlarrCache({ db, prowlarr, log }),
        log,
      }),
      download: albumDownload({ editions, qbittorrent, prowlarr, now, log }),
      import: albumImport({
        db,
        mediaDir,
        downloadsPath,
        qbittorrent,
        editions,
        musicBrainz,
        coverArt,
        jellyfin: new JellyfinClient({
          baseUrl: jellyfin.url,
          token: jellyfinKey,
          fetch,
          serverKey: true,
        }),
        people,
        now,
        log,
      }),
    },
  };
}
