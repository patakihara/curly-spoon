/**
 * A book's download: a torrent in qBittorrent, in Auralis's own category and tagged by the start's
 * key. A release's info hash is its natural key, so a repeat of a start finds what the first made.
 *
 * A hash already there under another category is the household's own torrent: Auralis follows it
 * and imports it, and never deletes it. A cancel deletes only what is in Auralis's category, by the
 * handle or by the key's tag, and never by a release's hash alone.
 */
import type { QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { ProwlarrClient, ProwlarrDetails } from '../../adapters/prowlarr/client.js';
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
const QUEUED = new Set(['queuedDL', 'checkingDL', 'checkingResumeData', 'moving', 'allocating']);
const SEEDING = new Set([
  'uploading',
  'forcedUP',
  'stalledUP',
  'queuedUP',
  'stoppedUP',
  'pausedUP',
  'checkingUP',
]);

/** How a torrent's state and progress read. An unknown state is a failure, not a guess. */
export function pollOutcome({ state, progress }: { state: string; progress: number }): PollOutcome {
  if (DOWNLOADING.has(state)) return { kind: 'downloading', progress };
  if (QUEUED.has(state)) return { kind: 'queued' };
  if (SEEDING.has(state) && progress === 1) return { kind: 'done' };
  return { kind: 'failed', reason: 'downloadFailed' };
}

const handleSchema = z.object({ hash: z.string(), owned: z.boolean(), addedAt: z.number() });
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
}

const tagOf = (key: string) => `auralis-${key}`;

export function bookDownload({ qbittorrent, prowlarr, now }: BookDownloadDeps): DownloadSteps {
  const cancel = async (target: DownloadTarget) => {
    if ('handle' in target) {
      const { hash, owned } = handleSchema.parse(target.handle);
      if (owned) await qbittorrent.deleteWithFiles([hash]);
      return;
    }
    const tagged = await qbittorrent.withTag(tagOf(target.key), BOOKS_CATEGORY);
    if (tagged.length > 0) await qbittorrent.deleteWithFiles(tagged.map((row) => row.hash));
  };
  return {
    start: async (_request, release, key) => {
      const torrent = await prowlarr.resolve(detailsSchema.parse(release.details));
      const [there] = await qbittorrent.withHashes([torrent.hash]);
      if (there !== undefined) {
        return {
          hash: torrent.hash,
          owned: there.category === BOOKS_CATEGORY,
          addedAt: there.added_on * 1000,
        };
      }
      await qbittorrent.createCategory(BOOKS_CATEGORY);
      await qbittorrent.add({ torrent, category: BOOKS_CATEGORY, tag: tagOf(key) });
      return { hash: torrent.hash, owned: true, addedAt: now() };
    },
    poll: async (handle) => {
      const { hash, addedAt } = handleSchema.parse(handle);
      const [row] = await qbittorrent.withHashes([hash]);
      if (row !== undefined) return pollOutcome(row);
      return now() - addedAt >= MISSING_GRACE_MS
        ? { kind: 'failed', reason: 'cancelledUpstream' }
        : { kind: 'queued' };
    },
    cancel,
  };
}
