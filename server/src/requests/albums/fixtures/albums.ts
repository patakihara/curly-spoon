/**
 * The recorded albums the album download's tests run on: The Slip's and Ghosts I–IV's editions from
 * MusicBrainz's recordings, Ghosts' files from the Internet Archive's recorded torrent, The Slip's
 * from the torrent a live request downloaded, and a pack
 * laid out from those. Tests only.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordingSchema } from '../../../adapters/http/recording.js';
import { replayFetch } from '../../../adapters/http/replay.js';
import { MusicBrainzClient, MUSICBRAINZ_USER_AGENT } from '../../../adapters/musicbrainz/client.js';
import { ALBUM_GROUPS } from '../../../adapters/record-musicbrainz.js';
import type { Db } from '../../../store/connection.js';
import { type TorrentFile, torrentContents } from '../../download/torrentFiles.js';
import { AlbumEditions, type Edition } from '../editions.js';

const ADAPTERS = join(dirname(fileURLToPath(import.meta.url)), '../../../adapters');
const recording = (call: string) =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, 'musicbrainz', 'recordings', `${call}.json`), 'utf8')),
  );

/** Ghosts I–IV as the Internet Archive's recorded torrent lists it. */
export const ghostsFiles = (): TorrentFile[] =>
  torrentContents(
    readFileSync(join(ADAPTERS, 'prowlarr', 'recordings', 'torrent-ghosts-ia.torrent')),
  )!.files;

/** The Slip as the torrent a live request downloaded lists it (qBittorrent's recorded files). */
export const slipFiles = (): TorrentFile[] =>
  (
    recordingSchema.parse(
      JSON.parse(
        readFileSync(join(ADAPTERS, 'qbittorrent', 'recordings', 'album-files.json'), 'utf8'),
      ),
    ).response.body as { json: { name: string; size: number }[] }
  ).json.map((file) => ({ path: file.name, size: file.size }));

/** The album editions on the recordings, kept in `db`. */
export function recordedAlbumEditions(db: Db): AlbumEditions {
  const musicBrainz = new MusicBrainzClient({
    baseUrl: 'http://upstream.invalid',
    fetch: replayFetch(['rg-slip', 'releases-slip', 'rg-ghosts', 'releases-ghosts'].map(recording)),
    userAgent: MUSICBRAINZ_USER_AGENT,
    clock: { now: () => 0, sleep: async () => undefined },
  });
  return new AlbumEditions({ db, musicBrainz });
}

/** The editions of the recorded groups. */
export async function recordedEditions(db: Db): Promise<{ slip: Edition[]; ghosts: Edition[] }> {
  const editions = recordedAlbumEditions(db);
  const slip = await editions.read(ALBUM_GROUPS.slip.group);
  const ghosts = await editions.read(ALBUM_GROUPS.ghosts.group);
  return { slip: slip!.editions, ghosts: ghosts!.editions };
}

export const PACK = 'Nine Inch Nails - Discography (FLAC)';
const pad = (n: number) => String(n).padStart(2, '0');

/** A discography holding Ghosts' recorded files in `ghostsAt`, The Slip by its titles, and a note. */
export function nineInchNailsPack(slip: Edition, ghostsAt = `${PACK}/2008 - Ghosts I-IV`) {
  const ghosts = ghostsFiles().map((file) => ({
    ...file,
    path: `${ghostsAt}/${file.path.split('/').slice(1).join('/')}`,
  }));
  const theSlip = slip.tracks.map((track, at) => ({
    path: `${PACK}/2008 - The Slip/${pad(at + 1)} - ${track.title}.flac`,
    size: 30_000_000,
  }));
  return [...theSlip, ...ghosts, { path: `${PACK}/info.txt`, size: 900 }];
}
