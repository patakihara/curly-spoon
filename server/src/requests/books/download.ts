/**
 * A book's download: a torrent in qBittorrent, in Auralis's own category and tagged by the start's
 * key. A release's info hash is its natural key, so a repeat of a start finds what the first made.
 *
 * A hash already there when a start comes is not that start's: Auralis follows it and imports it,
 * adds no tag to it, and never removes it. The one way Auralis deletes from qBittorrent: read the
 * torrent immediately before, and delete only if its category is Auralis's own and it carries this
 * request's own key as an exact tag. Any other state, or a failed read, sends no delete and logs why.
 */
import { carriesTag, type QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { ProwlarrClient, ProwlarrDetails } from '../../adapters/prowlarr/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { z } from 'zod';
import type { DownloadSteps, DownloadTarget, PollOutcome } from '../steps.js';

export const BOOKS_CATEGORY = 'auralis-books';

/** How long a torrent may be missing after its add, while qBittorrent takes it in. */
const MISSING_GRACE_MS = 120_000;

const DOWNLOADING = new Set([
  'metaDL',
  'forcedMetaDL',
  'downloading',
  'forcedDL',
  'stalledDL',
  'stoppedDL',
  'pausedDL',
]);
const QUEUED = new Set(['queuedDL', 'moving', 'allocating']);
const SEEDING = new Set([
  'uploading',
  'forcedUP',
  'stalledUP',
  'queuedUP',
  'stoppedUP',
  'pausedUP',
]);

/**
 * How a torrent's state and progress read. A torrent being checked waits: its progress drops for the
 * check and says nothing of the download. An unknown state is a failure, not a guess.
 */
export function pollOutcome({ state, progress }: { state: string; progress: number }): PollOutcome {
  if (state.startsWith('checking')) return { kind: 'queued' };
  if (DOWNLOADING.has(state)) return { kind: 'downloading', progress };
  if (QUEUED.has(state)) return { kind: 'queued' };
  if (SEEDING.has(state) && progress === 1) return { kind: 'done' };
  return { kind: 'failed', reason: 'downloadFailed' };
}

const handleSchema = z.object({ hash: z.string(), key: z.string(), addedAt: z.number() });
const detailsSchema: z.ZodType<ProwlarrDetails> = z.object({
  link: z.string().optional(),
  magnet: z.string().optional(),
  infoHash: z.string().optional(),
});

export interface BookDownloadDeps {
  qbittorrent: Pick<
    QbittorrentClient,
    'add' | 'createCategory' | 'deleteWithFiles' | 'withHashes' | 'withTag'
  >;
  prowlarr: Pick<ProwlarrClient, 'resolve'>;
  now: () => number;
  log?: JobLog;
}

const tagOf = (key: string) => `auralis-${key}`;

export function bookDownload({ qbittorrent, prowlarr, now, log }: BookDownloadDeps): DownloadSteps {
  const noDelete = (why: string) => log?.error({ why }, 'no torrent deleted');
  /** The rows the rule lets this cancel delete, read just now. */
  const deletable = async (target: DownloadTarget) => {
    if (!('handle' in target)) {
      const tagged = await qbittorrent.withTag(tagOf(target.key), BOOKS_CATEGORY);
      if (tagged.length === 0) noDelete('nothing carries this key');
      return tagged;
    }
    const handle = handleSchema.safeParse(target.handle);
    if (!handle.success) {
      noDelete('a handle that names no key');
      return [];
    }
    const { hash, key } = handle.data;
    const row = (await qbittorrent.withHashes([hash])).find((one) => one.hash === hash);
    if (row === undefined) noDelete('the torrent is not there');
    else if (row.category !== BOOKS_CATEGORY) noDelete('the torrent is in another category');
    else if (!carriesTag(row, tagOf(key))) noDelete('the torrent does not carry this key');
    else return [row];
    return [];
  };
  return {
    start: async (_request, release, key) => {
      const torrent = await prowlarr.resolve(detailsSchema.parse(release.details));
      const { hash } = torrent;
      const [there] = await qbittorrent.withHashes([hash]);
      if (there !== undefined) return { hash, key, addedAt: there.added_on * 1000 };
      await qbittorrent.createCategory(BOOKS_CATEGORY);
      await qbittorrent.add({ torrent, category: BOOKS_CATEGORY, tag: tagOf(key) });
      return { hash, key, addedAt: now() };
    },
    poll: async (handle) => {
      const { hash, addedAt } = handleSchema.parse(handle);
      const [row] = await qbittorrent.withHashes([hash]);
      if (row !== undefined) return pollOutcome(row);
      return now() - addedAt >= MISSING_GRACE_MS
        ? { kind: 'failed', reason: 'cancelledUpstream' }
        : { kind: 'queued' };
    },
    cancel: async (target) => {
      let rows;
      try {
        rows = await deletable(target);
      } catch (err) {
        noDelete(err instanceof Error ? err.message : 'the read failed');
        return;
      }
      if (rows.length > 0) await qbittorrent.deleteWithFiles(rows.map((row) => row.hash));
    },
  };
}
