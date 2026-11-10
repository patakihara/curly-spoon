/**
 * A torrent download, for books and albums: a torrent in qBittorrent, in the medium's own category
 * and tagged by the start's key. A release's info hash is its natural key, so a repeat of a start
 * finds what the first made.
 *
 * A hash already there when a start comes is not that start's: Auralis follows it and imports it,
 * adds no tag to it, and never removes it. The one way Auralis deletes from qBittorrent: read the
 * torrent immediately before, and delete only if its category is the medium's own and it carries
 * this request's own key as an exact tag. Any other state, or a failed read, sends no delete and
 * logs why.
 *
 * A medium may gate a download (`gate`): asked to stop at its metadata (`stopAtMetadata`), a
 * torrent of ours whose files are listed and that does not carry `auralis-fit` has its files
 * checked. Files that are not the release asked for fail `wrongRelease`. Files that are have any
 * the gate sets aside put at priority 0, then the torrent is started, then tagged `auralis-fit`;
 * a start lost on the way leaves no tag, so the next poll does it all again, harmlessly. The gate
 * reads the file list and not the state, so a qBittorrent that ignores the stop is gated the same,
 * a few seconds of bytes in. A torrent whose metadata never comes stays at progress 0, and the
 * job's stall rule takes it.
 */
import { carriesTag, type QbittorrentClient } from '../../adapters/qbittorrent/client.js';
import type { QbitFile, QbitTorrent } from '../../adapters/qbittorrent/schemas.js';
import type { ProwlarrClient, ProwlarrDetails } from '../../adapters/prowlarr/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import { z } from 'zod';
import type { StoredRequest } from '../../store/requests.js';
import type {
  DownloadHandle,
  DownloadSteps,
  DownloadTarget,
  PollOutcome,
  Release,
} from '../steps.js';

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

/** The tag a gated torrent carries once its files passed and it was started. */
export const FIT_TAG = 'auralis-fit';

/** Whether a torrent's files are the release asked for, and if so which to fetch none of. */
export type GateVerdict = { kind: 'fits'; setAside: number[] } | { kind: 'wrong' };

export interface TorrentGate {
  /** What the handle keeps for the gate, beside the hash, key and time of the add. */
  note(request: StoredRequest, release: Release): Record<string, unknown>;
  /** Checks a torrent's listed files, by the handle `note` filled. */
  check(handle: DownloadHandle, files: readonly QbitFile[]): Promise<GateVerdict>;
}

export interface TorrentDownloadDeps {
  /** The medium's own qBittorrent category, the only one a cancel deletes from. */
  category: string;
  /** Checks a torrent's files once they are listed, before it fetches more. */
  gate?: TorrentGate;
  /** Adds each torrent stopped once its metadata is in, for the gate to start. */
  stopAtMetadata?: boolean;
  qbittorrent: Pick<
    QbittorrentClient,
    | 'add'
    | 'addTag'
    | 'createCategory'
    | 'deleteWithFiles'
    | 'files'
    | 'setFilePriority'
    | 'start'
    | 'withHashes'
    | 'withTag'
  >;
  prowlarr: Pick<ProwlarrClient, 'resolve'>;
  now: () => number;
  log?: JobLog;
}

const tagOf = (key: string) => `auralis-${key}`;

export function torrentDownload({
  category,
  gate,
  stopAtMetadata = false,
  qbittorrent,
  prowlarr,
  now,
  log,
}: TorrentDownloadDeps): DownloadSteps {
  const noDelete = (why: string) => log?.error({ why }, 'no torrent deleted');
  /** The rows the rule lets this cancel delete, read just now. */
  const deletable = async (target: DownloadTarget) => {
    if (!('handle' in target)) {
      const tagged = await qbittorrent.withTag(tagOf(target.key), category);
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
    else if (row.category !== category) noDelete('the torrent is in another category');
    else if (!carriesTag(row, tagOf(key))) noDelete('the torrent does not carry this key');
    else return [row];
    return [];
  };
  /** Gates a torrent of ours that is not yet fit, once its files are listed; null for not yet. */
  const gated = async (
    gate: TorrentGate,
    handle: DownloadHandle,
    row: QbitTorrent,
  ): Promise<PollOutcome | null> => {
    const files = await qbittorrent.files(row.hash);
    if (files.length === 0) return null;
    const verdict = await gate.check(handle, files);
    if (verdict.kind === 'wrong') return { kind: 'failed', reason: 'wrongRelease' };
    if (verdict.setAside.length > 0) {
      await qbittorrent.setFilePriority(row.hash, verdict.setAside, 0);
    }
    await qbittorrent.start([row.hash]);
    await qbittorrent.addTag([row.hash], FIT_TAG);
    return { kind: 'downloading', progress: row.progress };
  };
  return {
    start: async (request, release, key) => {
      const torrent = await prowlarr.resolve(detailsSchema.parse(release.details));
      const { hash } = torrent;
      const noted = gate?.note(request, release) ?? {};
      const [there] = await qbittorrent.withHashes([hash]);
      if (there !== undefined) return { ...noted, hash, key, addedAt: there.added_on * 1000 };
      await qbittorrent.createCategory(category);
      await qbittorrent.add({ torrent, category, tag: tagOf(key), stopAtMetadata });
      return { ...noted, hash, key, addedAt: now() };
    },
    poll: async (handle) => {
      const { hash, key, addedAt } = handleSchema.parse(handle);
      const [row] = await qbittorrent.withHashes([hash]);
      const ours = row !== undefined && row.category === category && carriesTag(row, tagOf(key));
      if (gate !== undefined && ours && !carriesTag(row, FIT_TAG)) {
        const outcome = await gated(gate, handle, row);
        if (outcome !== null) return outcome;
      }
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
