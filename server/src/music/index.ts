/**
 * YouTube Music's playing side, when the configuration names an extractor: what `POST /play` and the
 * track route ask, the update job, and what admin sees. With no extractor named, a streamed ref is
 * not linked and the rest of the server runs as ever. Nothing here calls an upstream at start: the
 * image with no network starts, and owned music never touches any of it. No play ever carries a
 * stream's URL: every byte comes through the cache.
 */
import type { MediaRef, SearchSong } from '@auralis/schema';
import { basename, dirname, join } from 'node:path';
import type { FetchLike } from '../adapters/http/fetch.js';
import { publicFetch } from '../adapters/http/publicFetch.js';
import {
  type ImageHeaders,
  imageHeadersSchema,
  openStream,
  type UpstreamFile,
} from '../adapters/stream.js';
import { Visitor, type YtSong, YtMusicClient, YTMUSIC_URL } from '../adapters/ytmusic/client.js';
import { PLAYER_URL, YtPlayer } from '../adapters/ytmusic/player.js';
import type { AppConfig } from '../config.js';
import { type JobLog, scheduleJob } from '../jobs/schedule.js';
import type { Db } from '../store/connection.js';
import { streamedTrack } from '../store/streamedTracks.js';
import { type Canary, canaryOf, type CanaryResult } from './canary.js';
import { MOST_SONG_SECONDS, SongCatalogue, type SongSource } from './catalogue.js';
import { type DirectResolve, directResolver } from './direct.js';
import {
  DIRECT_LIMIT_MS,
  Extractor,
  ExtractorFailure,
  type ResolvedTier,
  type SpawnLike,
} from './extractor.js';
import type { StreamUrl } from './schemas.js';
import { quickLookup, StreamHosts } from './streamHosts.js';
import { StreamingState } from './state.js';
import {
  CHUNK_BYTES,
  RangeRefused,
  type StreamAnswer,
  StreamCache,
  StreamFailure,
} from './streamCache.js';
import { ExtractorUpdate, UPDATE_EVERY_MS, type UpdateOutcome } from './update.js';
import { ExtractorVersions, type VersionRow } from './versions.js';

export { MOST_SONG_SECONDS };

const PRELOADED_CHUNKS = 2;
const RESOLVED_AHEAD_MS = 5 * 60_000;
const MOST_RESOLVED_AHEAD = 200;
/** How many of a search's song rows are resolved ahead of a tap; the first also has its first chunk fetched. */
export const ROWS_RESOLVED_AHEAD = 2;
/** At most this many resolves ahead in any minute, whatever is searched: ten searches' worth. */
export const MOST_AHEAD_PER_MINUTE = 20;

/** This track cannot play, and that says nothing of streaming. `error` is what a client is told. */
export class TrackRefused extends Error {
  constructor(
    readonly error = 'not_found',
    readonly status: 404 | 422 = 404,
  ) {
    super(error);
    this.name = 'TrackRefused';
  }
}

/** No song from outside the library can play now, held ones aside. */
export class StreamingUnavailable extends Error {}

export interface MusicLog extends JobLog {
  warn: (details: Record<string, unknown>, message: string) => void;
}

export interface MusicDeps {
  db: Db;
  log: MusicLog;
  now: () => number;
  /** Where the extractor's home, its versions and the stream cache live. */
  dataDir: string;
  capBytes: number;
  imagePath: string;
  /** Reaches only the public internet, and follows no redirect. */
  streamFetch: FetchLike;
  canary: Canary;
  spawn?: SpawnLike;
  chunkBytes?: number;
  arch?: string;
  /** YouTube Music itself, for search and radio; with none, neither names a song. */
  client?: SongSource;
  /** How long a search waits for it. */
  searchLimitMs?: number;
  /** YouTube's player, asked ahead of the extractor. */
  direct?: DirectResolve;
  /** The visitor id YouTube Music's answers named last, which trims the extractor's plain run. */
  visitor?: () => string | null;
  /** Looks up a stream's host as soon as its song resolves, ahead of the first fetch. */
  warmHost?: (url: StreamUrl) => void;
}

/** What the canary last said of the direct resolve, for admin. */
export interface DirectState {
  passed: boolean;
  reason: string | null;
  at: number;
}

/** A reason that belongs to one track, or to the client, and says nothing of streaming. */
const TRACK_ERRORS = new Map<string, string>([
  ['gone', 'not_found'],
  ['badId', 'not_found'],
  ['changed', 'not_found'],
  ['live', 'song_live'],
  ['premiere', 'song_premiere'],
  ['noLength', 'song_no_length'],
  ['regionBlocked', 'song_region_blocked'],
  ['membersOnly', 'song_members_only'],
]);

export class Music {
  readonly state: StreamingState;
  private readonly cache: StreamCache;
  private readonly extractor: Extractor;
  private readonly versions: ExtractorVersions;
  private readonly update: ExtractorUpdate;
  private readonly preloading = new Map<string, { id: string; stop: AbortController }>();
  private readonly chunkBytes: number;
  private running: Promise<UpdateOutcome> | null = null;
  private readonly catalogue: SongCatalogue | null;
  /** The songs resolved ahead of a tap, and when. */
  private readonly ahead = new Map<string, number>();
  /** When each resolve ahead in the last minute was asked. */
  private aheadTimes: number[] = [];
  /** The top playable row of each device's last search, whose first chunk alone is fetched ahead. */
  private readonly aheadTop = new Map<string, string | null>();
  /** The first chunk each device's last search is fetching ahead. */
  private readonly aheadChunks = new Map<string, { id: string; stop: AbortController }>();
  /** Songs whose first chunk is fetched ahead, by how many such fetches, that no play has asked for. */
  private readonly aheadOnly = new Map<string, number>();
  private directState: DirectState | null = null;

  /**
   * The extractor, for a song: one it names as too long is refused before a byte is asked. A song
   * only fetched ahead, which no play has asked for, is resolved through the direct call alone.
   */
  private readonly songs = {
    resolve: async (id: string, options?: { replacing?: StreamUrl }) => {
      const audio = this.aheadOnly.has(id)
        ? await this.extractor.resolveAhead(id, options)
        : await this.extractor.resolve(id, options);
      if (audio.duration > MOST_SONG_SECONDS) throw new TrackRefused('unsupported_format', 422);
      this.deps.warmHost?.(audio.url);
      return audio;
    },
  };

  constructor(private readonly deps: MusicDeps) {
    const { db, now, dataDir, imagePath, streamFetch, spawn, log } = deps;
    this.state = new StreamingState(now);
    this.chunkBytes = deps.chunkBytes ?? CHUNK_BYTES;
    const home = join(dataDir, 'extractor', 'home');
    this.versions = new ExtractorVersions({
      db,
      dir: join(dataDir, 'extractor'),
      imagePath,
      imageVersion: basename(dirname(imagePath)),
    });
    this.extractor = new Extractor({
      path: this.versions.path,
      home,
      now,
      ...(spawn === undefined ? {} : { spawn }),
      ...(deps.direct === undefined ? {} : { direct: deps.direct }),
      ...(deps.visitor === undefined ? {} : { visitor: deps.visitor }),
      onDirectFailed: (reason) =>
        log.warn({ reason }, 'the direct resolve did not answer, so the extractor does'),
    });
    this.cache = new StreamCache({
      dir: join(dataDir, 'cache', 'streams'),
      db,
      capBytes: deps.capBytes,
      fetch: streamFetch,
      resolver: this.songs,
      now,
      chunkBytes: this.chunkBytes,
      onLog: (what) => log.warn({}, what),
    });
    this.catalogue =
      deps.client === undefined
        ? null
        : new SongCatalogue({
            client: deps.client,
            db,
            now,
            log,
            ...(deps.searchLimitMs === undefined ? {} : { limitMs: deps.searchLimitMs }),
          });
    this.update = new ExtractorUpdate({
      versions: this.versions,
      fetch: streamFetch,
      canary: deps.canary,
      now,
      home,
      log,
      onCanary: (result) => this.heard(result),
      ...(spawn === undefined ? {} : { spawn }),
      ...(deps.arch === undefined ? {} : { arch: deps.arch }),
    });
  }

  /** At start, and with no upstream call: the folders exist, and leftovers go. */
  prepare(): void {
    this.versions.prepare();
    this.cache.prepare();
  }

  /**
   * What a plan needs: how the file is typed, and what answered (`cache` for a track held whole,
   * which needs nothing upstream).
   */
  async plan(id: string): Promise<{ mime: string; tier: ResolvedTier | 'cache' }> {
    const whole = this.cache.whole(id);
    if (whole !== null) return { mime: whole.mime, tier: 'cache' };
    this.aheadOnly.delete(id);
    if (!this.state.available) throw new StreamingUnavailable();
    try {
      const { mime, tier } = await this.songs.resolve(id);
      return { mime, tier };
    } catch (error) {
      throw this.refusalOf(error, id);
    }
  }

  /** A client's range of a track, every byte through the cache. */
  async open(id: string, range: string | undefined, signal: AbortSignal): Promise<StreamAnswer> {
    this.aheadOnly.delete(id);
    const held = this.cache.whole(id) !== null;
    if (!held && !this.state.available) throw new StreamingUnavailable();
    try {
      const answer = await this.cache.open(id, range, signal);
      if (!held) this.state.succeeded();
      return answer;
    } catch (error) {
      if (error instanceof RangeRefused) throw error;
      throw this.refusalOf(error, id);
    }
  }

  /**
   * Fetches a track's first chunks ahead of its play, at most one per device: a newer pick takes the
   * place of the one running. The next play's first ask then finds them held. A failure is only
   * logged.
   */
  preload(deviceId: string, id: string): void {
    const running = this.preloading.get(deviceId);
    if (running?.id === id || !this.state.available) return;
    if (streamedTrack(this.deps.db, id) === undefined) return;
    this.aheadOnly.delete(id);
    running?.stop.abort();
    const mine = { id, stop: new AbortController() };
    this.preloading.set(deviceId, mine);
    void this.cache
      .open(id, `bytes=0-${PRELOADED_CHUNKS * this.chunkBytes - 1}`, mine.stop.signal)
      .then(async ({ body }) => {
        for await (const chunk of body) void chunk;
      })
      .catch((error: unknown) => {
        if (mine.stop.signal.aborted) return;
        const reason = error instanceof Error ? error.name : 'unknown';
        this.deps.log.warn({ reason }, 'a song could not be preloaded');
      })
      .finally(() => {
        if (this.preloading.get(deviceId) === mine) this.preloading.delete(deviceId);
      });
  }

  /** This device's queue changed, so what it was preloading may never play. */
  cancelPreload(deviceId: string): void {
    this.preloading.get(deviceId)?.stop.abort();
    this.preloading.delete(deviceId);
  }

  /** A song's art, from the address its row holds, through the public-only fetch. */
  async openArt(id: string): Promise<UpstreamFile<ImageHeaders>> {
    const url = streamedTrack(this.deps.db, id)?.artUrl ?? null;
    if (url === null) throw new TrackRefused();
    return openStream(this.deps.streamFetch, url, {}, undefined, imageHeadersSchema);
  }

  /** The songs a search finds. While streaming is unavailable none is listed, and nothing is asked. */
  async searchSongs(q: string, gone: AbortSignal): Promise<YtSong[]> {
    if (this.catalogue === null || !this.state.available) return [];
    return this.catalogue.search(q, gone);
  }

  /**
   * Readies a search's top song rows for their tap, without holding up its answer: the first
   * `ROWS_RESOLVED_AHEAD` resolved through the direct call alone, never a process, and the first
   * row's first chunk fetched. A newer search's first row stops this device's last chunk fetch, and
   * an older search's resolve ahead, answering late, fetches nothing. Each
   * song is asked once in the time a search is kept, at most `MOST_AHEAD_PER_MINUTE` in a minute, and
   * only one that plays: streamable, named, of a song's length. Nothing is asked while streaming is
   * unavailable, or with no direct call. A failure is only logged, and says nothing of streaming.
   */
  resolveAhead(deviceId: string, rows: readonly SearchSong[]): void {
    const top = rows
      .slice(0, ROWS_RESOLVED_AHEAD)
      .map((row) => (this.plays(row) ? row.ref.id : null));
    this.aheadTop.set(deviceId, top[0] ?? null);
    const chunk = this.aheadChunks.get(deviceId);
    if (chunk !== undefined && chunk.id !== top[0]) this.stopAheadChunk(deviceId);
    if (this.deps.direct === undefined || !this.state.available) return;
    top.forEach((id, n) => {
      if (id === null || !this.mayAskAhead(id)) return;
      this.extractor
        .resolveAhead(id)
        .then(({ url }) => {
          this.deps.warmHost?.(url);
          if (n === 0 && this.aheadTop.get(deviceId) === id) this.fetchAhead(deviceId, id);
        })
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.name : 'unknown';
          this.deps.log.warn({ reason }, 'a song could not be resolved ahead');
        });
    });
  }

  /** Whether a row is a song this server would play. */
  private plays(row: SearchSong): boolean {
    if (row.ref.source !== 'ytmusic' || row.availability.kind !== 'streamable') return false;
    const song = streamedTrack(this.deps.db, row.ref.id);
    return song !== undefined && song.duration <= MOST_SONG_SECONDS;
  }

  /** Counts a resolve ahead of `id`, unless it was asked lately or the minute's share is used. */
  private mayAskAhead(id: string): boolean {
    const now = this.deps.now();
    const last = this.ahead.get(id);
    if (last !== undefined && now - last < RESOLVED_AHEAD_MS) return false;
    this.aheadTimes = this.aheadTimes.filter((at) => now - at < 60_000);
    if (this.aheadTimes.length >= MOST_AHEAD_PER_MINUTE) return false;
    this.aheadTimes.push(now);
    if (this.ahead.size >= MOST_RESOLVED_AHEAD) this.ahead.clear();
    this.ahead.set(id, now);
    return true;
  }

  /** A song's first chunk, into the cache under its cap, for this device's last search. */
  private fetchAhead(deviceId: string, id: string): void {
    if (!this.state.available || this.aheadChunks.get(deviceId)?.id === id) return;
    this.stopAheadChunk(deviceId);
    const mine = { id, stop: new AbortController() };
    this.aheadChunks.set(deviceId, mine);
    this.aheadOnly.set(id, (this.aheadOnly.get(id) ?? 0) + 1);
    void this.cache
      .open(id, `bytes=0-${this.chunkBytes - 1}`, mine.stop.signal)
      .then(async ({ body }) => {
        for await (const part of body) void part;
      })
      .catch((error: unknown) => {
        if (mine.stop.signal.aborted) return;
        const reason = error instanceof Error ? error.name : 'unknown';
        this.deps.log.warn({ reason }, 'a song could not be fetched ahead');
      })
      .finally(() => {
        if (this.aheadChunks.get(deviceId) === mine) this.aheadChunks.delete(deviceId);
        const left = (this.aheadOnly.get(id) ?? 0) - 1;
        if (left > 0) this.aheadOnly.set(id, left);
        else this.aheadOnly.delete(id);
      });
  }

  private stopAheadChunk(deviceId: string): void {
    this.aheadChunks.get(deviceId)?.stop.abort();
    this.aheadChunks.delete(deviceId);
  }

  /** What autoplay asks of YouTube Music; never throws for streaming being down. */
  readonly radio = {
    available: (): boolean => this.catalogue !== null && this.state.available,
    radio: (id: string): Promise<MediaRef[]> => this.catalogue?.radio(id) ?? Promise.resolve([]),
    seedFor: (jellyfinId: string): Promise<string | null> =>
      this.catalogue?.seedFor(jellyfinId) ?? Promise.resolve(null),
  };

  /** What a job tick does. While streaming is unavailable each one checks again, due or not. */
  tick(): Promise<UpdateOutcome> {
    return this.once(() => (this.state.available ? this.update.tick() : this.update.run()));
  }

  /** The same run, now, as admin asks. One already going is joined. */
  runNow(): Promise<UpdateOutcome> {
    return this.once(() => this.update.run());
  }

  /** What admin sees of the job. */
  job(): {
    state: 'ok' | 'unavailable';
    reason: string | null;
    current: string;
    versions: VersionRow[];
    direct: DirectState | null;
  } {
    return {
      state: this.state.available ? 'ok' : 'unavailable',
      reason: this.state.reason,
      current: this.versions.now().version,
      versions: this.versions.rows(),
      direct: this.directState,
    };
  }

  private once(run: () => Promise<UpdateOutcome>): Promise<UpdateOutcome> {
    this.running ??= run()
      .then((outcome) => {
        if (outcome === 'promoted') this.state.succeeded();
        return outcome;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  /**
   * The canary's word on the version in use, and on the direct resolve. Either passing means songs
   * play. No result, a lost network, moves nothing.
   */
  private heard(result: CanaryResult): void {
    const { direct } = result;
    if (direct !== undefined) {
      this.directState = {
        passed: direct.passed,
        reason: direct.passed ? null : direct.reason,
        at: this.deps.now(),
      };
    }
    if (result.passed || direct?.passed === true) this.state.succeeded();
    else if (result.reason !== 'unavailable') this.state.canaryFailed(result.reason);
  }

  /** Counts a failure toward the state, and says how the route should answer it. */
  private refusalOf(error: unknown, id: string): Error {
    if (error instanceof TrackRefused) return error;
    if (error instanceof ExtractorFailure || error instanceof StreamFailure) {
      const own = TRACK_ERRORS.get(error.reason);
      if (own !== undefined) return new TrackRefused(own);
      this.state.playFailed(error.reason, id);
      return new StreamingUnavailable();
    }
    return error instanceof Error ? error : new StreamingUnavailable();
  }
}

export interface MusicConfigDeps {
  db: Db;
  fetch: FetchLike;
  log: MusicLog;
  now: () => number;
}

/** The music the configuration names, prepared, with its job; null with no extractor named. */
export function ytMusic(
  config: AppConfig,
  deps: MusicConfigDeps,
): { music: Music; stop: () => void } | null {
  const { extractorPath, canaryId, canaryQuery } = config.ytmusic;
  if (extractorPath === null) return null;
  const { db, fetch, log, now } = deps;
  const hosts = new StreamHosts({ lookup: quickLookup(), now });
  const streamFetch = publicFetch({ lookup: (host) => hosts.lookup(host) });
  const visitor = new Visitor();
  const client = new YtMusicClient({
    baseUrl: YTMUSIC_URL,
    fetch,
    now,
    onBad: (what) => log.warn({}, what),
    visitor,
  });
  const player = new YtPlayer({ baseUrl: PLAYER_URL, fetch, timeoutMs: DIRECT_LIMIT_MS });
  const direct = directResolver({
    player: (id, visitorId) => player.player(id, visitorId),
    visitor,
    // The song's own search: its title and first artist, as its row was listed.
    findVisitor: async (id) => {
      const song = streamedTrack(db, id);
      const query = song === undefined ? id : `${song.title} ${song.artists[0] ?? ''}`.trim();
      await client.search(query);
    },
  });
  const music = new Music({
    db,
    log,
    now,
    dataDir: config.dataDir,
    capBytes: config.streamCacheMib * 1024 * 1024,
    imagePath: extractorPath,
    streamFetch,
    client,
    direct,
    visitor: () => visitor.get(),
    warmHost: (url) => hosts.warm(url),
    canary: canaryOf({
      search: (query) => client.search(query),
      fetch: streamFetch,
      home: join(config.dataDir, 'extractor', 'home'),
      now,
      id: canaryId,
      query: canaryQuery,
      direct,
    }),
  });
  music.prepare();
  const stop = scheduleJob(
    { name: 'extractor', everyMs: UPDATE_EVERY_MS, run: async () => void (await music.tick()) },
    log,
  );
  return { music, stop };
}
