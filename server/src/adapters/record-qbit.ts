/**
 * Record mode's `qbit` part: qBittorrent's calls for M3.books, on controlled torrents alone.
 *
 * Two torrents are added, both tagged `auralis-record` in the category `auralis-books`: a made-up
 * info hash no swarm has (`add-magnet`, `info-queued`, `info-metadata`, `info-stalled`), and the
 * public torrent the command line names, Debian's installer (`info-absent`, `debian-queued`,
 * `info-downloading`, `info-done`, `files`, `add-existing`, `delete`, `delete-missing`). Every read names a hash or that tag, so the run never lists a household
 * torrent. Whatever fails, what this run added goes with its files and its tag goes too, and the
 * last step fails unless those hashes and the tag list nothing. A hash the run did not add is never
 * deleted, as it may be the household's, and a category the run did not create is never removed, as
 * Auralis's real downloads sit in it.
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { infoHashFromMagnet } from '../requests/download/torrentId.js';
import { AdapterError, type FetchLike } from './http/fetch.js';
import { createRecorder, withCleanup } from './http/record.js';
import { type Recording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import type { RawExchange } from './http/scrub.js';
import type { ResolvedRelease } from './prowlarr/client.js';
import { QbittorrentClient } from './qbittorrent/client.js';
import type { QbitTorrent } from './qbittorrent/schemas.js';

export const RECORD_TAG = 'auralis-record';
export const RECORD_CATEGORY = 'auralis-books';
/** A hash nothing was ever made from, so no peer can answer for it. */
export const MADE_UP_HASH = createHash('sha1').update('auralis made-up torrent').digest('hex');
const UNUSED_TAG = 'auralis-no-such-key';

/** Debian's file name, which the leak scan takes for a host. Part of no test but its shape. */
const FILE_STAND_IN = 'installer/netinst.bin';

const ROW_FIELDS = [
  'added_on',
  'amount_left',
  'category',
  'completed',
  'dlspeed',
  'downloaded',
  'hash',
  'last_activity',
  'num_seeds',
  'progress',
  'save_path',
  'size',
  'state',
  'tags',
];
const FILE_FIELDS = ['index', 'name', 'priority', 'progress', 'size'];

const only = (value: Record<string, unknown>, fields: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([field]) => fields.includes(field)));

/** An add's form with its magnet down to the hash, as the rest names a tracker. */
function cutAdd(raw: RawExchange): RawExchange {
  const { body } = raw.request;
  if (body === null || !('text' in body)) return raw;
  const form = new URLSearchParams(body.text);
  const magnet = form.get('urls');
  if (magnet === null) return raw;
  form.set('urls', magnet.replace(/&.*$/, ''));
  return { ...raw, request: { ...raw.request, body: { text: form.toString() } } };
}

/** A torrent row or file cut to what is kept: the rest names trackers, peers and paths. */
export function cutQbit(exchange: RawExchange): RawExchange {
  const raw = cutAdd(exchange);
  const { body } = raw.response;
  if (body === null || !('json' in body) || !Array.isArray(body.json)) return raw;
  const rows = body.json as Record<string, unknown>[];
  const json = raw.request.url.includes('torrents/files')
    ? rows.map((file) => ({ ...only(file, FILE_FIELDS), name: FILE_STAND_IN }))
    : rows.map((row) => only(row, ROW_FIELDS));
  return { ...raw, response: { ...raw.response, body: { json } } };
}

function scanned(recording: Recording) {
  const findings = scanRecording(recording);
  if (findings.length > 0) {
    const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
    throw new Error(`${recording.call}: ${found}; not written`);
  }
}

export interface QbitRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  url: string;
  key: string;
  /** A public torrent's magnet, which must have a healthy swarm. */
  magnet: string;
  /** Waits between looks; a test passes none. */
  sleep: (ms: number) => Promise<void>;
  /** Looks allowed for a torrent to reach a state. */
  looks?: number;
}

const LOOK_MS = 200;
const DEFAULT_LOOKS = 3_000;
const STALL_WATCH_MS = 30_000;

export async function recordQbit(input: QbitRecordInput): Promise<{ written: string[] }> {
  const { fetch, out, url: baseUrl, key: apiKey, magnet, sleep } = input;
  const hash = infoHashFromMagnet(magnet);
  if (hash === null) throw new Error('that magnet holds no info hash');
  const dir = join(input.root, 'qbittorrent', 'recordings');
  const written: string[] = [];
  const plain = new QbittorrentClient({ baseUrl, apiKey, fetch });
  const rec = createRecorder({
    fetch,
    dir,
    upstream: 'qbittorrent',
    upstreamVersion: await plain.version(),
    secrets: [apiKey],
    baseUrl,
    prepare: cutQbit,
  });
  const qbit = new QbittorrentClient({ baseUrl, apiKey, fetch: rec.fetch });
  const capture = async <T>(
    call: string,
    step: () => Promise<T>,
    check: (answer: T) => boolean = () => true,
  ): Promise<T> => {
    const answer = await rec.capture(call, step, {
      verify: (result, recording) => {
        if (!check(result)) throw new Error(`${call}: not the answer it records`);
        scanned(recording);
      },
    });
    written.push(join(dir, `${call}.json`));
    out(`${call}: recorded`);
    return answer;
  };
  const row = async (one: string) => (await plain.withHashes([one]))[0];
  const until = async (one: string, reached: (row: QbitTorrent) => boolean) => {
    for (let look = 0; look < (input.looks ?? DEFAULT_LOOKS); look += 1) {
      const found = await row(one);
      if (found !== undefined && reached(found)) return;
      await sleep(LOOK_MS);
    }
    throw new Error(`${one === hash ? 'the public torrent' : 'the made-up one'} did not get there`);
  };
  const added = new Set<string>();
  let categoryMade = false;
  /** Adds a torrent this run then answers for. One already there is not its own: the run stops. */
  const addOwn = async (client: QbittorrentClient, torrent: ResolvedRelease) => {
    const isNew = await client.add({ torrent, category: RECORD_CATEGORY, tag: RECORD_TAG });
    if (!isNew) throw new Error('a torrent to record was already there');
    added.add(torrent.hash);
  };
  const sameAs = (one: string) => (answer: QbitTorrent[]) => answer[0]?.hash === one;

  const work = async () => {
    const stranger = new QbittorrentClient({ baseUrl, apiKey: 'not-the-key', fetch: rec.fetch });
    await capture('unauthorized', () =>
      stranger.version().then(
        () => {
          throw new Error('a wrong key was let in');
        },
        (error: unknown) => {
          if (!(error instanceof AdapterError) || error.status !== 403) throw error;
        },
      ),
    );
    await capture('version', () => qbit.version());
    categoryMade = await capture('create-category', () => qbit.createCategory(RECORD_CATEGORY));
    await capture('create-category-again', () => qbit.createCategory(RECORD_CATEGORY));

    const fields = { category: RECORD_CATEGORY, tag: RECORD_TAG };
    const madeUp = `magnet:?xt=urn:btih:${MADE_UP_HASH}`;
    await capture('add-magnet', () =>
      addOwn(qbit, { kind: 'magnet', magnet: madeUp, hash: MADE_UP_HASH }),
    );
    await capture('info-queued', () => qbit.withHashes([MADE_UP_HASH]));
    await until(MADE_UP_HASH, (found) => found.state === 'metaDL');
    await capture('info-metadata', () => qbit.withHashes([MADE_UP_HASH]), sameAs(MADE_UP_HASH));
    await sleep(STALL_WATCH_MS);
    await capture('info-stalled', () => qbit.withHashes([MADE_UP_HASH]), sameAs(MADE_UP_HASH));

    await capture(
      'info-absent',
      () => qbit.withHashes([hash]),
      (answer) => answer.length === 0,
    );
    const torrent = { kind: 'magnet', magnet, hash } as const;
    await addOwn(plain, torrent);
    await until(hash, () => true);
    await capture('debian-queued', () => qbit.withHashes([hash]), sameAs(hash));
    await until(hash, (found) => found.progress > 0 && found.progress < 1);
    await capture('info-downloading', () => qbit.withHashes([hash]), sameAs(hash));
    await until(hash, (found) => found.progress === 1);
    await capture('info-done', () => qbit.withHashes([hash]), sameAs(hash));
    await capture(
      'files',
      () => qbit.files(hash),
      (answer) => answer.length > 0,
    );
    await capture('add-existing', () => qbit.add({ torrent, ...fields }));
    await capture(
      'info-by-tag',
      () => qbit.withTag(RECORD_TAG, RECORD_CATEGORY),
      (answer) => answer.length === 2,
    );
    await capture(
      'info-by-unused-tag',
      () => qbit.withTag(UNUSED_TAG, RECORD_CATEGORY),
      (answer) => answer.length === 0,
    );
    await capture('delete', () => qbit.deleteWithFiles([hash]));
    await capture('delete-missing', () => qbit.deleteWithFiles([hash]));
    await capture(
      'after-delete',
      () => qbit.withHashes([hash]),
      (answer) => answer.length === 0,
    );
  };
  const form = (fields: Record<string, string>): RequestInit => ({
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields).toString(),
  });
  const cleanup = async () => {
    const own = [...added];
    const stillThere = async () => (own.length === 0 ? [] : plain.withHashes(own));
    if (own.length > 0) await plain.deleteWithFiles(own);
    for (let look = 0; look < 10; look += 1) {
      if ((await stillThere()).length === 0) break;
      await sleep(LOOK_MS);
    }
    const left = [...(await stillThere()), ...(await plain.withTag(RECORD_TAG, RECORD_CATEGORY))];
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    if (categoryMade) {
      await fetch(`${base}api/v2/torrents/removeCategories`, form({ categories: RECORD_CATEGORY }));
    }
    await fetch(`${base}api/v2/torrents/deleteTags`, form({ tags: RECORD_TAG }));
    if (left.length > 0) throw new Error(`${left.length} recorded torrents were left behind`);
    out('cleaned up: no recorded torrent is left');
  };
  await withCleanup(work, cleanup, (error) => {
    out(`cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`);
  });
  return { written };
}
