import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MediaRef, QueueItem, QueueType } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { chapterSchema, itemSummarySchema, meSchema } from '../adapters/audiobookshelf/schemas.js';
import { parseFeed } from '../adapters/feed/client.js';
import { type FetchLike } from '../adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { JellyfinClient } from '../adapters/jellyfin/client.js';
import { indexQueryResultSchema } from '../adapters/jellyfin/schemas.js';
import { absTree, albumRow, orderingFromFeed, trackRows } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, episodesInOrder } from '../libraryIndex/store.js';
import { openDatabase, type Db } from '../store/connection.js';
import type { QueueEntry, SessionPlay, SessionValue } from '../store/listening.js';
import {
  AUTOPLAY_STALE_MS,
  type AutoplayDeps,
  autoplayStale,
  prepareAutoplay,
  storedAutoplay,
} from './autoplay.js';
import { step, type EngineDeps, type Expansion } from './engine.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

function json(r: Recording): unknown {
  if (r.response.body === null || !('json' in r.response.body)) throw new Error(r.call);
  return r.response.body.json;
}

function text(r: Recording): string {
  if (r.response.body === null || !('text' in r.response.body)) throw new Error(r.call);
  return r.response.body.text;
}

/** A copy of `r` whose answer is `edit` applied to a copy of the recorded body. */
function changed(r: Recording, edit: (body: Record<string, unknown>) => void): Recording {
  const body = structuredClone(json(r)) as Record<string, unknown>;
  edit(body);
  return { ...r, response: { ...r.response, body: { json: body } } };
}

const show1 = itemSummarySchema.parse(json(recording('audiobookshelf', 'index-show-1')));
const show2 = itemSummarySchema.parse(json(recording('audiobookshelf', 'index-show-2')));
const books = (['series-book-1', 'series-book-2'] as const).map((c) =>
  itemSummarySchema.parse(json(recording('audiobookshelf', c))),
);
const albums = indexQueryResultSchema.parse(json(recording('jellyfin', 'index-albums-page')));
const albumTracks = indexQueryResultSchema.parse(
  json(recording('jellyfin', 'index-album-tracks-1')),
).Items;
const album = albums.Items.find((a) => a.Id === albumTracks[0]?.AlbumId)!;
const mix = indexQueryResultSchema
  .parse(json(recording('jellyfin', 'jf-instant-mix')))
  .Items.map((t): MediaRef => ({ source: 'jellyfin', id: t.Id }));

const ME = recording('audiobookshelf', 'me');
const ME_FINISHED = recording('audiobookshelf', 'me-finished');
const INSTANT_MIX = recording('jellyfin', 'jf-instant-mix');

const abs = (id: string): MediaRef => ({ source: 'abs', id });
const jf = (id: string): MediaRef => ({ source: 'jellyfin', id });
const tracks = albumTracks.map((t) => jf(t.Id));
const albumRef = jf(album.Id);
const [book1, book2] = books.map((b) => abs(b.id)) as [MediaRef, MediaRef];
/** Each recorded series book's chapter count, from its recorded item answer. */
const chapters = new Map(
  (['series-book-1', 'series-book-2'] as const).map((c) => {
    const book = z
      .object({ id: z.string(), media: z.object({ chapters: z.array(chapterSchema) }) })
      .parse(json(recording('audiobookshelf', c)));
    return [book.id, book.media.chapters.length];
  }),
);

/** The engine's index lookup, over the recordings: a book enters as its recorded chapters. */
function expand(ref: MediaRef): Expansion | null {
  const count = chapters.get(ref.id);
  if (count === undefined) return null;
  return {
    kind: 'book',
    entries: Array.from({ length: count }, (_, chapter) => ({ ref, chapter })),
    from: { kind: 'book', ref },
  };
}

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  const counts = emptyCounts();
  for (const [show, feed] of [
    [show1, 'show-1-feed'],
    [show2, 'show-2-feed'],
  ] as const) {
    if (show.mediaType !== 'podcast') throw new Error('expected a show');
    const ordering = orderingFromFeed(show, parseFeed(text(recording('feed', feed))));
    applyTree(db, absTree(show, ordering), 1, counts);
  }
  for (const book of books) applyTree(db, absTree(book), 1, counts);
  applyTree(db, { top: albumRow(album), children: trackRows(album.Id, albumTracks) }, 1, counts);
});
afterEach(() => {
  db.close();
  vi.useRealTimers();
});

const COMMON = { baseUrl: 'http://upstream.invalid', token: '<token>' };
const NOW = 5_000_000;
/** How long an adapter waits for an upstream before it gives up. */
const ONE_TIMEOUT_MS = 15_000;

/** Resolver deps on replayed recordings, counting every upstream call and every warning. */
function resolver(
  absAnswers: Recording[] | FetchLike = [ME],
  jellyfinAnswers: Recording[] | FetchLike = [INSTANT_MIX],
) {
  const calls: string[] = [];
  const warnings: string[] = [];
  const counted =
    (answers: Recording[] | FetchLike): FetchLike =>
    (url, init) => {
      calls.push(new URL(url).pathname);
      return (typeof answers === 'function' ? answers : replayFetch(answers))(url, init);
    };
  const deps: AutoplayDeps = {
    db,
    expand,
    abs: new AbsClient({ ...COMMON, fetch: counted(absAnswers) }),
    jellyfin: new JellyfinClient({ ...COMMON, fetch: counted(jellyfinAnswers) }),
    log: { warn: (_detail, message) => warnings.push(message) },
    now: () => NOW,
  };
  return { deps, calls, warnings };
}

let ids = 0;
const item = (entry: QueueEntry): QueueItem => ({
  ...entry,
  itemId: `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
});

const plays = (queue: QueueType, entries: QueueEntry[]): SessionPlay[] =>
  entries.map((e, seq) => ({ seq, queue, ...e, playedAt: 1000 + seq }));

/** A session whose `queue` plays `current`, after `played`, with nothing else queued. */
function playing(
  queue: QueueType,
  current: QueueEntry | null,
  played: QueueEntry[] = [],
  from: SessionValue['queues']['music']['context'] = null,
): SessionValue {
  const idle = { current: null, position: null, user: [], context: null };
  return {
    active: queue,
    switchAfterCurrent: null,
    queueStyle: 'youtube',
    queues: {
      music: idle,
      spoken: idle,
      [queue]: { ...idle, current: current === null ? null : item(current), context: from },
    },
    history: plays(queue, played),
    autoplay: { music: null, spoken: null },
    radio: null,
    autoplayAt: null,
  };
}

const pick = (s: SessionValue, queue: QueueType) => s.autoplay[queue]?.next ?? null;

const engine = (autoplay: EngineDeps['autoplay']): EngineDeps => ({
  expand: () => null,
  autoplay,
  newId: () => item({ ref: book1 }).itemId,
  now: () => 9000,
});

describe('[M1.sessions/e] autoplay on the spoken queue', () => {
  const serial = () => episodesInOrder(db, show1.id).map((e) => abs(e.id));

  /** `me` with each of `episodes` (of show 1) marked finished too. */
  const finishing = (me: Recording, episodes: MediaRef[]) =>
    changed(me, (body) => {
      const progress = body['mediaProgress'] as Record<string, unknown>[];
      const template = meSchema.parse(json(ME_FINISHED)).mediaProgress[0]!;
      for (const e of episodes) {
        progress.push({ ...template, id: `${template.id}-${e.id}`, episodeId: e.id });
      }
    });

  it('plays the episode after the current one in a serial show, oldest to newest', async () => {
    const [partOne, partTwo, partThree] = serial();
    const finished = meSchema.parse(json(ME_FINISHED)).mediaProgress[0]!;
    expect(finished).toMatchObject({ episodeId: partOne!.id, isFinished: true });

    const s = await prepareAutoplay(playing('spoken', { ref: partTwo! }), resolver().deps);
    // Part one is unfinished and older, but it comes before part two: never jump back to it.
    expect(pick(s, 'spoken')).toEqual({ ref: partThree });

    const fromOne = await prepareAutoplay(playing('spoken', { ref: partOne! }), resolver().deps);
    expect(pick(fromOne, 'spoken')).toEqual({ ref: partTwo });
  });

  it('skips an episode after the current one that the user finished on Audiobookshelf', async () => {
    const [partOne, partTwo, partThree] = serial();
    const { deps } = resolver([finishing(ME, [partTwo!])]);

    const s = await prepareAutoplay(playing('spoken', { ref: partOne! }), deps);

    expect(pick(s, 'spoken')).toEqual({ ref: partThree });
  });

  it('skips an episode this session already played, even before Audiobookshelf marks it finished', async () => {
    const [partOne, partTwo, partThree] = serial();
    // Part two played here earlier; Audiobookshelf has not caught up.
    const s = await prepareAutoplay(
      playing('spoken', { ref: partOne! }, [{ ref: partTwo! }]),
      resolver().deps,
    );

    expect(pick(s, 'spoken')).toEqual({ ref: partThree });
  });

  it('has nothing after the last episode of a serial show, even with earlier ones unfinished', async () => {
    const order = serial();
    const last = { ref: order.at(-1)! };

    const s = await prepareAutoplay(playing('spoken', last), resolver().deps);

    expect(s.autoplay.spoken).toEqual({ after: last, next: null });
  });

  it('plays the next older episode of an episodic show, and nothing after its oldest', async () => {
    const order = episodesInOrder(db, show2.id).map((e) => abs(e.id));
    expect(show2.mediaType === 'podcast' && show2.media.episodes.length).toBe(order.length);
    const { deps } = resolver();

    const fromNewest = await prepareAutoplay(playing('spoken', { ref: order[0]! }), deps);
    expect(pick(fromNewest, 'spoken')).toEqual({ ref: order[1] });

    const fromSecond = await prepareAutoplay(playing('spoken', { ref: order[1]! }), deps);
    expect(pick(fromSecond, 'spoken')).toEqual({ ref: order[2] });

    const fromOldest = await prepareAutoplay(playing('spoken', { ref: order.at(-1)! }), deps);
    expect(pick(fromOldest, 'spoken')).toBeNull();
  });

  it('plays a show of unknown order like an episodic one, newest to oldest', async () => {
    const oldestFirst = serial();
    db.prepare(`UPDATE index_items SET episode_order = 'unknown' WHERE upstream_id = ?`).run(
      show1.id,
    );
    const order = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    expect(order).toEqual([...oldestFirst].reverse());
    const [newest, second] = order;

    const s = await prepareAutoplay(playing('spoken', { ref: newest! }), resolver().deps);
    expect(pick(s, 'spoken')).toEqual({ ref: second });

    const oldest = await prepareAutoplay(
      playing('spoken', { ref: order.at(-1)! }),
      resolver().deps,
    );
    expect(pick(oldest, 'spoken')).toBeNull();
  });

  it('plays the next chapter of a book without asking Audiobookshelf', async () => {
    const { deps, calls } = resolver();
    const s = await prepareAutoplay(playing('spoken', { ref: book1, chapter: 3 }), deps);

    expect(pick(s, 'spoken')).toEqual({ ref: book1, chapter: 4 });
    expect(calls).toEqual([]);
  });

  it('rolls the last chapter on to the next book in its series, from its first chapter', async () => {
    const last = chapters.get(book1.id)! - 1;
    const s = await prepareAutoplay(
      playing('spoken', { ref: book1, chapter: last }),
      resolver().deps,
    );

    expect(pick(s, 'spoken')).toEqual({ ref: book2, chapter: 0 });
  });

  it('has nothing to play after the last book, or when the next one is finished', async () => {
    const lastOf = (book: MediaRef) => ({ ref: book, chapter: chapters.get(book.id)! - 1 });
    const end = await prepareAutoplay(playing('spoken', lastOf(book2)), resolver().deps);
    expect(end.autoplay.spoken).toEqual({ after: lastOf(book2), next: null });

    const book2Finished = changed(ME_FINISHED, (me) => {
      const [progress] = me['mediaProgress'] as Record<string, unknown>[];
      Object.assign(progress!, { libraryItemId: book2.id, episodeId: null });
    });
    const done = await prepareAutoplay(
      playing('spoken', lastOf(book1)),
      resolver([book2Finished]).deps,
    );
    expect(done.autoplay.spoken).toEqual({ after: lastOf(book1), next: null });
  });

  it('follows the newest spoken play when the queue has no current item', async () => {
    const [, partTwo, partThree] = serial();
    const s = await prepareAutoplay(
      playing('spoken', null, [{ ref: partTwo! }]),
      resolver([ME_FINISHED]).deps,
    );

    expect(s.autoplay.spoken).toEqual({ after: { ref: partTwo }, next: { ref: partThree } });
  });
});

describe('[M1.sessions/e] autoplay on the music queue', () => {
  const fromAlbum = { from: { kind: 'album' as const, ref: albumRef }, items: [] };

  it('plays the rest of the album the queue plays from, by disc and position', async () => {
    const { deps, calls } = resolver();
    const s = await prepareAutoplay(playing('music', { ref: tracks[11]! }, [], fromAlbum), deps);

    expect(pick(s, 'music')).toEqual({ ref: tracks[12] });
    expect(calls).toEqual([]);
  });

  it('then radio from music you own: Instant Mix for the last track, skipping what has played', async () => {
    const last = tracks.at(-1)!;
    const played = [{ ref: tracks[11]! }, { ref: tracks[12]! }];
    const s = await prepareAutoplay(
      playing('music', { ref: last }, played, fromAlbum),
      resolver().deps,
    );

    // The mix opens with the last track itself, then track 12, which has played.
    expect(mix.slice(0, 2)).toEqual([last, tracks[11]]);
    expect(pick(s, 'music')).toEqual({ ref: mix[2] });
    expect(s.radio).toEqual({ seed: last, tracks: mix });
  });

  it('keeps to the stored radio run, never fetching it again while a track of it is left', async () => {
    const last = tracks.at(-1)!;
    const { deps, calls } = resolver();
    let s = await prepareAutoplay(playing('music', { ref: last }, [], fromAlbum), deps);
    expect(pick(s, 'music')).toEqual({ ref: mix[1] });

    // Step on through the run: each pick comes from the stored run.
    for (const n of [1, 2, 3]) {
      s = step(s, 'next', engine(storedAutoplay));
      expect(s.queues.music.current?.ref).toEqual(mix[n]);
      s = await prepareAutoplay(s, deps);
    }
    // A radio track from the album played from continues the radio, not the album.
    expect(s.queues.music.current?.ref).toEqual(mix[3]);
    expect(pick(s, 'music')).toEqual({ ref: mix[4] });
    expect(calls.filter((c) => c.endsWith('/InstantMix'))).toHaveLength(1);
  });

  it('fetches the run again once every track of it has played', async () => {
    const last = tracks.at(-1)!;
    const run = mix.slice(0, 3);
    const s = playing(
      'music',
      { ref: last },
      run.map((ref) => ({ ref })),
      fromAlbum,
    );
    s.radio = { seed: last, tracks: run };
    const { deps, calls } = resolver();

    const next = await prepareAutoplay(s, deps);

    expect(calls).toEqual([`/Items/${last.id}/InstantMix`]);
    expect(pick(next, 'music')).toEqual({ ref: mix[3] });
    expect(next.radio).toEqual({ seed: last, tracks: mix });
  });

  it('keeps no radio run that has nothing left to play: the next pass asks Instant Mix again', async () => {
    const last = tracks.at(-1)!;
    const emptyMix = changed(INSTANT_MIX, (body) => {
      body['Items'] = [];
      body['TotalRecordCount'] = 0;
    });
    const { deps, calls } = resolver([ME], [emptyMix]);

    const once = await prepareAutoplay(playing('music', { ref: last }, [], fromAlbum), deps);
    expect(once.autoplay.music).toEqual({ after: { ref: last }, next: null });
    expect(once.radio).toBeNull();

    const again = await prepareAutoplay(once, resolver().deps);
    expect(pick(again, 'music')).toEqual({ ref: mix[1] });
    expect(calls.filter((c) => c.endsWith('/InstantMix'))).toHaveLength(1);
  });

  it('works nothing out while the queue still has items after the current one', async () => {
    const { deps, calls } = resolver();
    const s = playing('music', { ref: tracks.at(-1)! }, [], fromAlbum);
    s.queues.music.user = [item({ ref: tracks[0]! })];

    expect((await prepareAutoplay(s, deps)).autoplay.music).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('[M1.sessions/e] the stored pick', () => {
  it('answers a step from the session alone, never waiting on an upstream', async () => {
    const { deps, calls } = resolver([ME_FINISHED]);
    const [, partTwo, partThree] = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    const prepared = await prepareAutoplay(playing('spoken', { ref: partTwo! }), deps);
    const before = calls.length;

    const s = step(prepared, 'next', engine(storedAutoplay));

    expect(s.queues.spoken.current?.ref).toEqual(partThree);
    expect(calls).toHaveLength(before);
  });

  it('is worked out afresh on every pass, seeing what another device finished meanwhile', async () => {
    const [, partTwo, partThree, partFour] = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    const first = await prepareAutoplay(
      playing('spoken', { ref: partTwo! }),
      resolver([ME_FINISHED]).deps,
    );
    expect(pick(first, 'spoken')).toEqual({ ref: partThree });

    // Another device finishes part three; the same item, prepared again, reads it.
    const elsewhere = changed(ME_FINISHED, (me) => {
      const progress = me['mediaProgress'] as Record<string, unknown>[];
      progress.push({ ...progress[0], id: 'elsewhere', episodeId: partThree!.id });
    });
    const { deps, calls } = resolver([elsewhere]);
    const again = await prepareAutoplay(first, deps);

    expect(calls).toEqual(['/api/me']);
    expect(pick(again, 'spoken')).toEqual({ ref: partFour });
  });

  it('records when it was worked out, and is stale once that is over two minutes old', async () => {
    const s = await prepareAutoplay(playing('music', null), resolver().deps);

    expect(s.autoplayAt).toBe(NOW);
    expect(AUTOPLAY_STALE_MS).toBe(2 * 60_000);
    expect(autoplayStale(playing('music', null), NOW)).toBe(true);
    expect(autoplayStale(s, NOW + AUTOPLAY_STALE_MS)).toBe(false);
    expect(autoplayStale(s, NOW + AUTOPLAY_STALE_MS + 1)).toBe(true);
  });

  it('is not used for an item it was not worked out for', () => {
    const s = playing('music', null, [{ ref: tracks[0]! }]);
    s.autoplay.music = { after: { ref: tracks[5]! }, next: { ref: tracks[6]! } };

    expect(storedAutoplay('music', s)).toBeNull();
    s.autoplay.music = { after: { ref: tracks[0]! }, next: { ref: tracks[6]! } };
    expect(storedAutoplay('music', s)).toEqual({ ref: tracks[6] });
  });
});

describe('[M1.sessions/e] an upstream that fails', () => {
  const down: FetchLike = () => Promise.reject(new TypeError('fetch failed'));
  const unavailable: FetchLike = () => Promise.resolve(new Response('', { status: 503 }));

  it('leaves music with nothing for this step when Jellyfin is down, logged, and asks again next time', async () => {
    const last = tracks.at(-1)!;
    const fromAlbum = { from: { kind: 'album' as const, ref: albumRef }, items: [] };
    const { deps, calls, warnings } = resolver([ME], down);

    const s = await prepareAutoplay(playing('music', { ref: last }, [], fromAlbum), deps);

    expect(s.autoplay.music).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(step(s, 'next', engine(storedAutoplay)).queues.music.current).toBeNull();
    await prepareAutoplay(s, deps);
    expect(calls.filter((c) => c.endsWith('/InstantMix'))).toHaveLength(2);
  });

  it('leaves spoken with nothing for this step when Audiobookshelf answers an error', async () => {
    const [, partTwo] = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    const { deps, warnings } = resolver(unavailable);

    const s = await prepareAutoplay(playing('spoken', { ref: partTwo! }), deps);

    expect(s.autoplay.spoken).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('leaves spoken with nothing when Audiobookshelf never answers, once the call times out', async () => {
    vi.useFakeTimers();
    const [, partTwo] = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    const hangs: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const { deps, warnings } = resolver(hangs);

    const pending = prepareAutoplay(playing('spoken', { ref: partTwo! }), deps);
    await vi.advanceTimersByTimeAsync(60_000);
    const s = await pending;

    expect(s.autoplay.spoken).toBeNull();
    expect(warnings).toHaveLength(1);
  });

  it('reads both upstreams at once, so when both hang the pass costs one timeout, not two', async () => {
    vi.useFakeTimers();
    const hangs: FetchLike = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const [, partTwo] = episodesInOrder(db, show1.id).map((e) => abs(e.id));
    const s = playing('music', { ref: tracks.at(-1)! }, [], {
      from: { kind: 'album', ref: albumRef },
      items: [],
    });
    s.queues.spoken.current = item({ ref: partTwo! });
    const { deps, warnings } = resolver(hangs, hangs);

    let done: SessionValue | undefined;
    void prepareAutoplay(s, deps).then((value) => (done = value));
    await vi.advanceTimersByTimeAsync(ONE_TIMEOUT_MS);

    expect(done?.autoplay).toEqual({ music: null, spoken: null });
    expect(warnings).toHaveLength(2);
  });
});
