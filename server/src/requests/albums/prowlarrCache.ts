/**
 * How the album search asks Prowlarr: in Audio, on the indexers that list music, in the server's
 * one Prowlarr queue (`../prowlarr.ts`), which books share, and each answer kept for a day. A
 * release link is asked in the same queue.
 *
 * One search fans out to every indexer at once and takes about 30 s (live), and the sites set their
 * own limits, so a request's retry, a second person asking for the same album, a pick of another
 * release or a search after a restart reads the kept answer and asks no site. Searches waiting their
 * turn read it too, once their turn comes. Which indexers list music is read once a day.
 *
 * A kept row holds no key and no address: the release's page is dropped, a row with a link to ask
 * keeps the link alone (its path and query, keyless, which `ProwlarrClient.resolve` answers with
 * the full magnet), and a row with only a magnet keeps its hash, as the rest names trackers.
 *
 * A link asked before any download is kept for a day too (`prowlarr_links`): the info hash a 301
 * magnet names, or a `.torrent`'s files and whether it names a web seed (never the seed's address).
 * A link that gives nothing usable, or no answer at all (an indexer's site down or slow), is kept as
 * null, so it is not asked again each turn: its row loses only its file list, which the gate reads
 * once the torrent's metadata is in.
 */
import { z } from 'zod';
import type { Clock } from '../../adapters/musicbrainz/client.js';
import { AUDIO_CATEGORY, type ProwlarrRelease } from '../../adapters/prowlarr/client.js';
import type { JobLog } from '../../jobs/schedule.js';
import type { Db } from '../../store/connection.js';
import type { ProwlarrCalls, SharedProwlarr } from '../prowlarr.js';
import { type TorrentFile, torrentContents } from '../download/torrentFiles.js';
import { infoHashFromMagnet } from '../download/torrentId.js';

export const PROWLARR_CACHE_MS = 24 * 60 * 60 * 1000;
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

const linkAnswerSchema = z
  .object({
    hash: z.string(),
    files: z.array(z.object({ path: z.string(), size: z.number() })).nullable(),
    webSeed: z.boolean(),
  })
  .nullable();

/**
 * What a link answered: its torrent's info hash, the torrent's files when it gave a `.torrent`
 * (null for a magnet), and whether the torrent names a web seed.
 */
export interface LinkAnswer {
  hash: string;
  files: TorrentFile[] | null;
  webSeed: boolean;
}

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
  /** The server's one Prowlarr, whose queue books share. */
  prowlarr: Pick<SharedProwlarr, 'inTurn' | 'musicIndexers'>;
  clock?: Clock;
  log?: JobLog;
}

/** The indexers a search asked, as its kept answer is keyed: sorted ids, comma-separated. */
const keyOf = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(',');

export class ProwlarrCache {
  private readonly clock: Clock;
  private indexers: { ids: number[]; at: number } | null = null;

  constructor(private readonly deps: ProwlarrCacheDeps) {
    this.clock = deps.clock ?? realClock;
  }

  /** Every release the music indexers list for `query`, kept or asked now. */
  async search(query: string): Promise<ProwlarrRelease[]> {
    const indexerIds = await this.musicIndexers();
    if (indexerIds.length === 0) return [];
    const key = keyOf(indexerIds);
    const known = this.read(query, key);
    if (known !== null) return known;
    return this.deps.prowlarr.inTurn(async (prowlarr) => {
      const meanwhile = this.read(query, key);
      if (meanwhile !== null) return meanwhile;
      const rows = (await prowlarr.search(query, { categories: [AUDIO_CATEGORY], indexerIds })).map(
        kept,
      );
      this.write(query, key, rows);
      return rows;
    });
  }

  /** The kept answer for `query`, asking nothing but which indexers list music; null if none. */
  async kept(query: string): Promise<ProwlarrRelease[] | null> {
    const indexerIds = await this.musicIndexers();
    if (indexerIds.length === 0) return [];
    return this.read(query, keyOf(indexerIds));
  }

  /** What `link` answered within the day: undefined if it was not asked, null if it gave nothing. */
  keptLink(link: string): LinkAnswer | null | undefined {
    const row = this.deps.db
      .prepare<[string, number], { answer: string }>(
        'SELECT answer FROM prowlarr_links WHERE link = ? AND at > ?',
      )
      .get(link, this.clock.now() - PROWLARR_CACHE_MS);
    if (row === undefined) return undefined;
    const parsed = linkAnswerSchema.safeParse(JSON.parse(row.answer));
    return parsed.success ? parsed.data : undefined;
  }

  /**
   * Asks `link` with no redirect followed, in the searches' queue since it reaches the same sites,
   * and keeps its answer: a magnet's hash, or a torrent's hash, files and web seed. Anything
   * else, a failure included, is kept as null. A link kept while it waited its turn is not asked.
   */
  askLink(link: string): Promise<LinkAnswer | null> {
    return this.deps.prowlarr.inTurn(async (prowlarr) => {
      const meanwhile = this.keptLink(link);
      return meanwhile === undefined ? this.resolveLink(prowlarr, link) : meanwhile;
    });
  }

  private async resolveLink(
    prowlarr: Pick<ProwlarrCalls, 'resolve'>,
    link: string,
  ): Promise<LinkAnswer | null> {
    let answer: LinkAnswer | null = null;
    try {
      const resolved = await prowlarr.resolve({ link });
      if (resolved.kind === 'magnet') {
        answer = { hash: resolved.hash, files: null, webSeed: false };
      } else {
        const contents = torrentContents(resolved.bytes);
        answer =
          contents === null
            ? null
            : { hash: contents.hash, files: contents.files, webSeed: contents.webSeeds.length > 0 };
      }
    } catch (error) {
      // By its kind alone: a message could name the link's address.
      const kind = error instanceof Error ? error.name : 'unknown';
      this.deps.log?.error({ err: kind }, 'a release link gave no file list');
    }
    const now = this.clock.now();
    const { db } = this.deps;
    db.transaction(() => {
      db.prepare('DELETE FROM prowlarr_links WHERE at <= ?').run(now - PROWLARR_CACHE_MS);
      db.prepare(
        `INSERT INTO prowlarr_links (link, at, answer) VALUES (?, ?, ?)
         ON CONFLICT (link) DO UPDATE SET at = excluded.at, answer = excluded.answer`,
      ).run(link, now, JSON.stringify(answer));
    })();
    return answer;
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
