/**
 * Record mode's `albums` part: what M3.albums' search reads of Prowlarr, all reads. Nothing is added
 * to any download client: a release's link is only asked where it points.
 *
 * Only freely licensed albums are searched for: Nine Inch Nails' The Slip and Ghosts I-IV (CC
 * BY-NC-SA) and Jonathan Coulton's Artificial Heart (CC BY-NC). The repo is public.
 *
 * - The indexers (`indexers`), each cut to its id, name, whether it is on, its protocol and its
 *   categories before anything is written: the rest holds the site's settings.
 * - Searches in Audio on the music indexers, as the album search asks them, 30 s apart: The Slip
 *   by artist and title (`music-slip`) and by title alone (`music-slip-album`), Ghosts I-IV
 *   (`music-ghosts`), Artificial Heart in all three forms (`music-artificial-heart`, `-album`,
 *   `-discography`), and the band's discography (`music-nin-discography`).
 * - Two links asked with no redirect followed: Ghosts on the Internet Archive, answering a torrent
 *   (`torrent-ghosts-ia`), and a row with no hash, answering a magnet (`link-magnet-music`).
 *
 * The torrent is committed beside its recording as `torrent-ghosts-ia.torrent`: its `info`
 * dictionary verbatim, so its hash holds, and its `url-list` with each address at the placeholder
 * host. Nothing else of it is kept (its trackers, its comment). Rows are scrubbed as the books part
 * scrubs them, with one list of stand-ins for the indexers across the run.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { infoBytes, torrentContents } from '../requests/download/torrentFiles.js';
import { type FetchLike } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import { PLACEHOLDER_ORIGIN, type RawExchange } from './http/scrub.js';
import { AUDIO_CATEGORY, ProwlarrClient, type ProwlarrRelease } from './prowlarr/client.js';
import { anonymiseProwlarr, indexerStandIns } from './record-books.js';

/** The searches, as the album search words them: each album's artist and title, as torrents write it. */
export const ALBUM_SEARCHES = [
  ['music-slip', 'Nine Inch Nails The Slip'],
  ['music-slip-album', 'The Slip'],
  ['music-ghosts', 'Nine Inch Nails Ghosts I-IV'],
  ['music-artificial-heart', 'Jonathan Coulton Artificial Heart'],
  ['music-artificial-heart-album', 'Artificial Heart'],
  ['music-artificial-heart-discography', 'Jonathan Coulton discography'],
  ['music-nin-discography', 'Nine Inch Nails discography'],
] as const;

/** The gap between two calls to Prowlarr in a run, so the sites see a person's pace. */
export const ALBUM_RECORD_GAP_MS = 30_000;

export const TORRENT_STAND_IN = 'torrent-ghosts-ia.torrent';
const IA_INDEXER = 'Internet Archive';

/** A byte string as bencode writes it. */
const bString = (bytes: Uint8Array) =>
  Buffer.concat([Buffer.from(`${bytes.length}:`, 'latin1'), bytes]);

/**
 * A torrent cut to what the recording may keep: its `info` verbatim and its web seeds at the
 * placeholder host, path kept. Null for bytes that are not a torrent.
 */
export function cutTorrent(bytes: Uint8Array): Uint8Array | null {
  const info = infoBytes(bytes);
  const contents = torrentContents(bytes);
  if (info === null || contents === null) return null;
  const seeds = contents.webSeeds.map((seed) => {
    const url = new URL(seed);
    return Buffer.from(`${PLACEHOLDER_ORIGIN}${url.pathname}`, 'utf8');
  });
  return new Uint8Array(
    Buffer.concat([
      Buffer.from('d4:info', 'latin1'),
      info,
      Buffer.from('8:url-listl', 'latin1'),
      ...seeds.map(bString),
      Buffer.from('ee', 'latin1'),
    ]),
  );
}

/** An indexer listing cut to the fields named in the header, each name at its stand-in. */
export function cutIndexers(
  standIn: (indexer: string) => string,
): (raw: RawExchange) => RawExchange {
  return (raw) => {
    const { body } = raw.response;
    if (body === null || !('json' in body) || !Array.isArray(body.json)) {
      throw new Error('the indexer listing came with no list');
    }
    const json = (body.json as Record<string, unknown>[]).map((one) => {
      const capabilities = one.capabilities as { categories?: unknown } | undefined;
      const categories = Array.isArray(capabilities?.categories)
        ? (capabilities.categories as Record<string, unknown>[]).map((category) => ({
            id: category.id,
            name: category.name,
            subCategories: Array.isArray(category.subCategories)
              ? (category.subCategories as Record<string, unknown>[]).map((sub) => ({
                  id: sub.id,
                  name: sub.name,
                }))
              : [],
          }))
        : [];
      return {
        id: one.id,
        name: typeof one.name === 'string' ? standIn(one.name) : one.name,
        enable: one.enable,
        protocol: one.protocol,
        capabilities: { categories },
      };
    });
    const type = raw.response.headers['content-type'];
    const headers: Record<string, string> = type === undefined ? {} : { 'content-type': type };
    return { ...raw, response: { ...raw.response, headers, body: { json } } };
  };
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

export interface AlbumsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  prowlarrUrl: string;
  prowlarrKey: string;
  /** The wait between calls; a test passes none. */
  sleep?: (ms: number) => Promise<void>;
}

export async function recordAlbums(input: AlbumsRecordInput): Promise<{ written: string[] }> {
  const { fetch, out, prowlarrUrl: baseUrl, prowlarrKey: apiKey } = input;
  const sleep =
    input.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const dir = join(input.root, 'prowlarr', 'recordings');
  const written: string[] = [];
  const standIn = indexerStandIns();
  const rows = anonymiseProwlarr(standIn);
  const indexers = cutIndexers(standIn);
  const plain = new ProwlarrClient({ baseUrl, apiKey, fetch });
  const rec = createRecorder({
    fetch,
    dir,
    upstream: 'prowlarr',
    upstreamVersion: await plain.version(),
    secrets: [apiKey],
    baseUrl,
    prepare: (raw) =>
      new URL(raw.request.url).pathname.endsWith('/api/v1/indexer') ? indexers(raw) : rows(raw),
  });
  const prowlarr = new ProwlarrClient({ baseUrl, apiKey, fetch: rec.fetch });

  const indexerIds = await rec.capture('indexers', () => prowlarr.musicIndexers(), {
    verify: (ids, recording) => {
      if (ids.length === 0) throw new Error('no indexer lists music');
      scanned(recording);
    },
  });
  written.push(join(dir, 'indexers.json'));
  out(`indexers: ${indexerIds.length} list music`);

  const found = new Map<string, ProwlarrRelease[]>();
  for (const [call, query] of ALBUM_SEARCHES) {
    await sleep(ALBUM_RECORD_GAP_MS);
    const answer = await rec.capture(
      call,
      () => prowlarr.search(query, { categories: [AUDIO_CATEGORY], indexerIds }),
      { verify: (_, recording) => scanned(recording) },
    );
    found.set(call, answer);
    written.push(join(dir, `${call}.json`));
    out(`${call}: ${answer.length} rows`);
  }

  const ghosts = found.get('music-ghosts') ?? [];
  const archived = ghosts.find(
    (row) =>
      row.source === IA_INDEXER &&
      /flac/i.test(row.title) &&
      row.details.link !== undefined &&
      row.details.infoHash !== undefined,
  );
  if (archived?.details.link === undefined) throw new Error('no Internet Archive FLAC of Ghosts');
  await sleep(ALBUM_RECORD_GAP_MS);
  const standInFile = join(dir, TORRENT_STAND_IN);
  await rec
    .capture('torrent-ghosts-ia', () => prowlarr.resolve({ link: archived.details.link }), {
      standIn: {
        bytes: TORRENT_STAND_IN,
        synthesized:
          "the torrent's info dictionary verbatim, so its hash holds, and its url-list at the placeholder host; nothing else of it",
      },
      verify: (answer, recording) => {
        if (answer.kind !== 'torrent') throw new Error('that link did not answer with a torrent');
        if (answer.hash !== archived.details.infoHash) throw new Error('its hash is not the row’s');
        scanned(recording);
      },
    })
    .then(async (answer) => {
      const cut = answer.kind === 'torrent' ? cutTorrent(answer.bytes) : null;
      if (cut === null) throw new Error('that torrent could not be read');
      await writeFile(standInFile, cut);
    });
  written.push(join(dir, 'torrent-ghosts-ia.json'));
  out('torrent-ghosts-ia: a torrent');

  const hashless = ghosts.find(
    (row) =>
      row.details.infoHash === undefined &&
      row.details.magnet === undefined &&
      row.details.link !== undefined,
  );
  if (hashless?.details.link === undefined) throw new Error('no row of Ghosts without a hash');
  await sleep(ALBUM_RECORD_GAP_MS);
  await rec.capture('link-magnet-music', () => prowlarr.resolve({ link: hashless.details.link }), {
    verify: (answer, recording) => {
      if (answer.kind !== 'magnet') throw new Error('that link did not answer with a magnet');
      scanned(recording);
    },
  });
  written.push(join(dir, 'link-magnet-music.json'));
  out('link-magnet-music: a magnet');
  return { written };
}
