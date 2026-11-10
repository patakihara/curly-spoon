/**
 * How the album search asks Prowlarr: in Audio, on the indexers that list music, one search at a
 * time for the whole server, each starting at least 10 s after the one before it ended, and each
 * answer kept for a day.
 *
 * One search fans out to every indexer at once and takes about 30 s (live), and the sites set their
 * own limits, so a request's retry, a second person asking for the same album, a pick of another
 * release or a search after a restart reads the kept answer and asks no site. Searches waiting their
 * turn read it too, once their turn comes. Which indexers list music is read once a day.
 *
 * A kept row holds no key and no address: the release's page is dropped, a row with a link to ask
 * keeps the link alone (its path and query, keyless, which `ProwlarrClient.resolve` answers with
 * the full magnet), and a row with only a magnet keeps its hash, as the rest names trackers.
 */
import { z } from 'zod';
import type { Clock } from '../../adapters/musicbrainz/client.js';
import {
  AUDIO_CATEGORY,
  type ProwlarrClient,
  type ProwlarrRelease,
} from '../../adapters/prowlarr/client.js';
import type { Db } from '../../store/connection.js';
import { infoHashFromMagnet } from '../download/torrentId.js';

export const PROWLARR_CACHE_MS = 24 * 60 * 60 * 1000;
export const PROWLARR_GAP_MS = 10_000;
const INDEXERS_CACHE_MS = 24 * 60 * 60 * 1000;

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const storedRowSchema = z.object({
  title: z.string(),
  source: z.string(),
  size: z.number().nullable(),
  seeders: z.number().nullable(),
  files: z.number().nullable(),
  infoUrl: z.null(),
  details: z.object({
    link: z.string().optional(),
    magnet: z.string().optional(),
    infoHash: z.string().optional(),
  }),
});
const storedRowsSchema = z.array(storedRowSchema);

/** A release as it is kept: see the file's header. */
function kept(row: ProwlarrRelease): ProwlarrRelease {
  const { link, magnet } = row.details;
  const infoHash =
    row.details.infoHash ?? (magnet === undefined ? null : infoHashFromMagnet(magnet)) ?? undefined;
  const bare = infoHash === undefined ? undefined : `magnet:?xt=urn:btih:${infoHash}`;
  return {
    ...row,
    infoUrl: null,
    details: {
      ...(link === undefined ? {} : { link }),
      ...(link !== undefined || magnet === undefined || bare === undefined ? {} : { magnet: bare }),
      ...(infoHash === undefined ? {} : { infoHash }),
    },
  };
}

export interface ProwlarrCacheDeps {
  db: Db;
  prowlarr: Pick<ProwlarrClient, 'search' | 'musicIndexers'>;
  clock?: Clock;
}

export class ProwlarrCache {
  private readonly clock: Clock;
  /** The end of the queue: the turn of the search asked last. */
  private tail: Promise<unknown> = Promise.resolve();
  /** When the last search ended, so the next starts no sooner than the gap after it. */
  private lastEnded = Number.NEGATIVE_INFINITY;
  private indexers: { ids: number[]; at: number } | null = null;

  constructor(private readonly deps: ProwlarrCacheDeps) {
    this.clock = deps.clock ?? realClock;
  }

  /** Every release the music indexers list for `query`, kept or asked now. */
  async search(query: string): Promise<ProwlarrRelease[]> {
    const indexerIds = await this.musicIndexers();
    if (indexerIds.length === 0) return [];
    const key = [...indexerIds].sort((a, b) => a - b).join(',');
    const known = this.read(query, key);
    if (known !== null) return known;
    return this.inTurn(async () => {
      const meanwhile = this.read(query, key);
      if (meanwhile !== null) return meanwhile;
      const rows = (
        await this.deps.prowlarr.search(query, { categories: [AUDIO_CATEGORY], indexerIds })
      ).map(kept);
      this.write(query, key, rows);
      return rows;
    });
  }

  private async musicIndexers(): Promise<number[]> {
    const now = this.clock.now();
    if (this.indexers !== null && now - this.indexers.at < INDEXERS_CACHE_MS) {
      return this.indexers.ids;
    }
    const ids = await this.deps.prowlarr.musicIndexers();
    this.indexers = { ids, at: now };
    return ids;
  }

  /** Runs `work` once every search before it has ended and the gap has passed. */
  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.tail.then(async () => {
      const wait = this.lastEnded + PROWLARR_GAP_MS - this.clock.now();
      if (wait > 0) await this.clock.sleep(wait);
      try {
        return await work();
      } finally {
        this.lastEnded = this.clock.now();
      }
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  private read(query: string, key: string): ProwlarrRelease[] | null {
    const row = this.deps.db
      .prepare<[string, string, number], { rows: string }>(
        'SELECT rows FROM prowlarr_searches WHERE query = ? AND indexer_ids = ? AND at > ?',
      )
      .get(query, key, this.clock.now() - PROWLARR_CACHE_MS);
    if (row === undefined) return null;
    const parsed = storedRowsSchema.safeParse(JSON.parse(row.rows));
    return parsed.success ? parsed.data : null;
  }

  private write(query: string, key: string, rows: ProwlarrRelease[]): void {
    const now = this.clock.now();
    const { db } = this.deps;
    db.transaction(() => {
      db.prepare('DELETE FROM prowlarr_searches WHERE at <= ?').run(now - PROWLARR_CACHE_MS);
      db.prepare(
        `INSERT INTO prowlarr_searches (query, indexer_ids, at, rows) VALUES (?, ?, ?, ?)
         ON CONFLICT (query, indexer_ids) DO UPDATE SET at = excluded.at, rows = excluded.rows`,
      ).run(query, key, now, JSON.stringify(rows));
    })();
  }
}
