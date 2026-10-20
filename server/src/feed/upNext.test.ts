import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type MediaRef, mediaRefKey, UP_NEXT_MAX } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../adapters/audiobookshelf/client.js';
import { itemSummarySchema } from '../adapters/audiobookshelf/schemas.js';
import {
  type AbsMe,
  book,
  bookRef,
  booksLibrary,
  four,
  index,
  karaMe,
  one,
  ref,
  SEPT_15,
  show1,
  show2,
  three,
  two,
} from '../adapters/http/listsServer.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import type { Reader } from '../lists/reader.js';
import { absTree } from '../libraryIndex/rows.js';
import { applyTree, emptyCounts, episodesInOrder } from '../libraryIndex/store.js';
import { artUrl } from '../routes/art.js';
import { absAccess } from '../routes/library.js';
import { openDatabase, type Db } from '../store/connection.js';
import type { PlayedMark } from '../store/lists.js';
import type { UserPlay } from '../store/listening.js';
import type { FeedShelf } from '@auralis/schema';
import { composeFeed, DIGEST_SYNC_MS } from './upNext.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const absRecording = (call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(
      readFileSync(join(ADAPTERS, 'audiobookshelf', 'recordings', `${call}.json`), 'utf8'),
    ),
  );
const itemOf = (r: Recording) =>
  itemSummarySchema.parse((r.response.body as { json: unknown }).json);
const [series1, series2] = (['series-book-1', 'series-book-2'] as const).map((c) =>
  itemOf(absRecording(c)),
) as [ReturnType<typeof itemOf>, ReturnType<typeof itemOf>];
const book1 = ref(series1.id);
const book2 = ref(series2.id);

/** The recorded four-file book, copied under `count` new ids: more books than a shelf holds. */
const bookCopies = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const copy = structuredClone(book);
    copy.id = `copy-${String(i).padStart(2, '0')}-${book.id}`;
    return copy;
  });

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
  const counts = emptyCounts();
  for (const b of [series1, series2]) applyTree(db, absTree(b), 1, counts);
});
afterEach(() => db.close());

/** One progress row of `GET /api/me`, over `me-finished`'s, whose recorded rows carry these too. */
type Progress = Partial<AbsMe['mediaProgress'][number]> & {
  currentTime?: number;
  hideFromContinueListening?: boolean;
};
/** An episode of show 1 or 2 in progress on Audiobookshelf, last changed at `lastUpdate`. */
const episodeStarted = (episode: MediaRef, show: MediaRef, lastUpdate = 1): Progress => ({
  libraryItemId: show.id,
  episodeId: episode.id,
  isFinished: false,
  progress: 0.4,
  currentTime: 600,
  lastUpdate,
});
const episodeFinished = (episode: MediaRef, show: MediaRef, lastUpdate = 1): Progress => ({
  ...episodeStarted(episode, show, lastUpdate),
  isFinished: true,
  progress: 1,
});
const bookStarted = (b: MediaRef, lastUpdate = 1): Progress => ({
  libraryItemId: b.id,
  episodeId: null,
  isFinished: false,
  progress: 0.25,
  currentTime: 300,
  lastUpdate,
});
const bookFinished = (b: MediaRef, lastUpdate = 1): Progress => ({
  ...bookStarted(b, lastUpdate),
  isFinished: true,
  progress: 1,
});

/**
 * kara as a list reader: her `me-finished` with its progress replaced by `rows` (none by
 * default), granted every library or only `libraries`, with Auralis's played `marks`.
 */
async function reader(
  rows: Progress[] = [],
  options: { libraries?: string[]; marks?: [MediaRef, number][]; hiddenSeries?: string[] } = {},
): Promise<Reader> {
  const me = karaMe(rows);
  const body = (me.response.body as { json: AbsMe & { seriesHideFromContinueListening: string[] } })
    .json;
  if (options.libraries !== undefined) {
    body.permissions = { ...body.permissions, accessAllLibraries: false };
    body.librariesAccessible = options.libraries;
  }
  body.seriesHideFromContinueListening = options.hiddenSeries ?? [];
  const abs = new AbsClient({
    baseUrl: 'http://upstream.invalid',
    token: '<token>',
    fetch: replayFetch([me]),
  });
  const marks = new Map<string, PlayedMark>(
    (options.marks ?? []).map(([r, at]) => [
      mediaRefKey(r),
      { at, confirmed: false, sentAt: null, failures: 0 },
    ]),
  );
  return { db, userId: 'kara', access: await absAccess(abs), marks, now: SEPT_15 };
}

const MINUTE = 60_000;

let seq = 0;
/** One spoken play of `r` on `device` at `playedAt`, made in digest `list` when named. */
function play(
  r: MediaRef,
  playedAt: number,
  extra: { device?: string; list?: string; chapter?: number; queue?: 'spoken' | 'music' } = {},
): UserPlay {
  return {
    deviceId: extra.device ?? 'kara',
    seq: ++seq,
    queue: extra.queue ?? 'spoken',
    ref: r,
    playedAt,
    ...(extra.chapter === undefined ? {} : { chapter: extra.chapter }),
    ...(extra.list === undefined ? {} : { list: extra.list }),
  };
}

const shelf = (shelves: FeedShelf[], id: FeedShelf['id']) =>
  shelves.find((s) => s.id === id)?.items.map((card) => card.ref.id) ?? null;
const upNext = (shelves: FeedShelf[]) => shelf(shelves, 'up-next');
const secondRecent = (shelves: FeedShelf[]) => shelf(shelves, 'second-recent');

describe('[M2.sorting] Up next ranks what you listened to', () => {
  it('puts the book or show you listened to most recently first, across your devices', async () => {
    const r = await reader([episodeStarted(two, show1), bookStarted(bookRef)]);
    const feed = await composeFeed(r, [
      play(bookRef, 3000, { device: 'kara-phone', chapter: 1 }),
      play(two, 2000, { device: 'kara' }),
    ]);
    expect(upNext(feed)).toEqual([bookRef.id, two.id]);

    const later = await composeFeed(r, [
      play(bookRef, 3000, { device: 'kara-phone', chapter: 1 }),
      play(two, 4000, { device: 'kara' }),
    ]);
    expect(upNext(later)).toEqual([two.id, bookRef.id]);
  });

  it('keeps plays from two devices apart even when they share a sequence number', async () => {
    const r = await reader([episodeStarted(two, show1), bookStarted(bookRef)]);
    const onPhone = { ...play(bookRef, 2000, { device: 'kara-phone' }), seq: 7 };
    const onWeb = { ...play(two, 3000, { device: 'kara' }), seq: 7 };
    expect(upNext(await composeFeed(r, [onWeb, onPhone]))).toEqual([two.id, bookRef.id]);
  });

  it('counts a book or episode in progress on Audiobookshelf, played elsewhere, by when it changed', async () => {
    const r = await reader([bookStarted(bookRef, 5000), episodeStarted(three, show1, 1000)]);
    // Nothing played in Auralis: listening in the Audiobookshelf app is enough.
    expect(upNext(await composeFeed(r, []))).toEqual([bookRef.id, three.id]);
    // The newer of the Auralis play and the Audiobookshelf change ranks it.
    const feed = await composeFeed(r, [play(three, 6000)]);
    expect(upNext(feed)).toEqual([three.id, bookRef.id]);
  });

  it('counts an item begun by time alone, before Audiobookshelf counts any share of it', async () => {
    const r = await reader([{ ...bookStarted(bookRef), progress: 0, currentTime: 120 }]);
    expect(upNext(await composeFeed(r, []))).toEqual([bookRef.id]);
  });

  it('counts what you finished in the Audiobookshelf app, moving on past it', async () => {
    const book = await reader([bookFinished(book1, 2000)]);
    expect(upNext(await composeFeed(book, []))).toEqual([book2.id]);

    const episode = await reader([episodeFinished(two, show1, 2000)]);
    expect(upNext(await composeFeed(episode, []))).toEqual([three.id]);
  });

  it('leaves out what you hid from Continue Listening on Audiobookshelf', async () => {
    const hidden = { ...bookStarted(bookRef, 3000), hideFromContinueListening: true };
    const r = await reader([hidden, episodeStarted(two, show1, 2000)]);
    expect(await composeFeed(r, [])).toEqual([
      expect.objectContaining({ id: 'up-next', items: [expect.objectContaining({ ref: two })] }),
    ]);
    // Played in Auralis too, it still never shows as a card.
    expect(upNext(await composeFeed(r, [play(bookRef, 4000)]))).toEqual([two.id]);

    // Nor does it lead on to what follows it.
    const episode = { ...episodeStarted(two, show1), hideFromContinueListening: true };
    expect(await composeFeed(await reader([episode]), [])).toEqual([]);
  });

  it('moves on in no series you hid from Continue Series on Audiobookshelf', async () => {
    const [earthsea] = series1.mediaType === 'book' ? series1.media.metadata.series : [];
    const r = await reader([bookFinished(book1, 2000)], { hiddenSeries: [earthsea!.id] });
    expect(await composeFeed(r, [])).toEqual([]);
  });

  it('skips a later book of a series in a library you may not open', async () => {
    const elsewhere = structuredClone(series2);
    elsewhere.libraryId = 'a-library-kara-may-not-open';
    const third = structuredClone(series2);
    if (third.mediaType !== 'book') throw new Error('expected a book');
    third.id = `third-${third.id}`;
    third.media.metadata.series = third.media.metadata.series.map((x) => ({ ...x, sequence: '3' }));
    const counts = emptyCounts();
    for (const b of [elsewhere, third]) applyTree(db, absTree(b), 2, counts);
    const r = await reader([bookFinished(book1, 2000)], { libraries: [booksLibrary] });
    expect(upNext(await composeFeed(r, []))).toEqual([third.id]);
  });

  it('holds one card per book or show, from its newest episode', async () => {
    const r = await reader([episodeStarted(two, show1, 1), episodeStarted(three, show1, 1)]);
    const feed = await composeFeed(r, [play(three, 3000), play(two, 2000)]);
    expect(upNext(feed)).toEqual([three.id]);
  });

  it(`holds at most ${UP_NEXT_MAX} cards, the newest`, async () => {
    const copies = bookCopies(UP_NEXT_MAX + 2);
    const counts = emptyCounts();
    for (const copy of copies) applyTree(db, absTree(copy), 1, counts);
    const refs = copies.map((c) => ref(c.id));
    const r = await reader(refs.map((b) => bookStarted(b)));
    const feed = await composeFeed(
      r,
      refs.map((b, i) => play(b, 1000 + i)),
    );
    expect(upNext(feed)).toEqual(
      refs
        .map((b) => b.id)
        .reverse()
        .slice(0, UP_NEXT_MAX),
    );
  });

  it('never holds music', async () => {
    const r = await reader([bookStarted(bookRef)]);
    const track: MediaRef = { source: 'jellyfin', id: 'a-track' };
    const feed = await composeFeed(r, [play(track, 9000, { queue: 'music' }), play(bookRef, 1000)]);
    expect(upNext(feed)).toEqual([bookRef.id]);
    expect(secondRecent(feed)).toBeNull();
  });
});

describe('[M2.sorting] what each card of Up next is', () => {
  it('resumes the newest episode of a show while it is unplayed, though Auralis played it', async () => {
    const r = await reader([episodeStarted(two, show1)]);
    const [card] = (await composeFeed(r, [play(two, 2000)]))[0]!.items;
    expect(card).toMatchObject({
      ref: two,
      kind: 'episode',
      sub: 'Marshall Islands: After the Bomb Dropped',
      progress: 0.4,
      availability: { kind: 'owned' },
    });
    expect(card!.art).toBe(artUrl(show1));
  });

  it('moves on in show order past a finished episode and any played one after it', async () => {
    const finished = await reader([episodeFinished(two, show1)]);
    expect(upNext(await composeFeed(finished, [play(two, 2000)]))).toEqual([three.id]);

    const markedToo = await reader([episodeFinished(two, show1)], { marks: [[three, 5]] });
    expect(upNext(await composeFeed(markedToo, [play(two, 2000)]))).toEqual([four.id]);
  });

  it('has no card for a show played to its end', async () => {
    const r = await reader([episodeFinished(four, show1), bookStarted(bookRef)]);
    expect(upNext(await composeFeed(r, [play(four, 2000), play(bookRef, 1000)]))).toEqual([
      bookRef.id,
    ]);
  });

  it('resumes an unfinished book, with its progress and authors', async () => {
    const r = await reader([bookStarted(bookRef)]);
    const [card] = (await composeFeed(r, [play(bookRef, 2000, { chapter: 2 })]))[0]!.items;
    expect(card).toMatchObject({ ref: bookRef, kind: 'book', progress: 0.25 });
    expect(card!.sub).toBe('Ursula K. Le Guin');
  });

  it('moves a finished book on to the next unfinished book of its series, or has no card', async () => {
    const r = await reader([bookFinished(book1)]);
    expect(upNext(await composeFeed(r, [play(book1, 2000)]))).toEqual([book2.id]);

    const both = await reader([bookFinished(book1), bookFinished(book2)]);
    expect(await composeFeed(both, [play(book1, 2000)])).toEqual([]);
  });

  it('shows the same card once, from the newer of the books that lead to it', async () => {
    const r = await reader([bookFinished(book1), bookStarted(book2)]);
    expect(upNext(await composeFeed(r, [play(book2, 3000), play(book1, 2000)]))).toEqual([
      book2.id,
    ]);
  });
});

describe('[M2.sorting/b] Up next holds only owned items from your own history', () => {
  it('[M2.sorting/b] a digest play neither ranks a show nor moves your place in one', async () => {
    const digest = 'the-digest';
    const [newest] = episodesInOrder(db, show2.id);
    const r = await reader([episodeStarted(two, show1, 1)]);
    const feed = await composeFeed(r, [
      play(newest!, 9000, { list: digest }),
      play(four, 8000, { list: digest }),
      play(two, 2000),
    ]);
    expect(upNext(feed)).toEqual([two.id]);
    expect(feed.flatMap((s) => s.items).map((c) => c.ref.id)).not.toContain(newest!.id);
  });

  it('[M2.sorting/b] leaves out progress on Audiobookshelf that a digest play made, synced up to ten minutes after it', async () => {
    const [newest] = episodesInOrder(db, show2.id);
    const synced = 50 * MINUTE;
    const r = await reader([episodeStarted(newest!, show2, synced), bookStarted(bookRef, 1)]);
    const digestAt = (at: number) => composeFeed(r, [play(newest!, at, { list: 'the-digest' })]);
    // Audiobookshelf changed it no later than ten minutes after the digest's play: the digest
    // made it, its sync landing once the play stopped being current.
    expect(upNext(await digestAt(synced))).toEqual([bookRef.id]);
    expect(upNext(await digestAt(synced + MINUTE))).toEqual([bookRef.id]);
    expect(upNext(await digestAt(synced - DIGEST_SYNC_MS))).toEqual([bookRef.id]);
    // Changed later than that: listening in the Audiobookshelf app since.
    expect(upNext(await digestAt(synced - DIGEST_SYNC_MS - 1))).toEqual([newest!.id, bookRef.id]);

    // Played as your own after the digest: your progress again.
    const ownAfter = await composeFeed(r, [
      play(newest!, synced - 1),
      play(newest!, synced - 2, { list: 'the-digest' }),
    ]);
    expect(upNext(ownAfter)).toEqual([newest!.id, bookRef.id]);
  });

  it('[M2.sorting/b] leaves out progress on Audiobookshelf on an episode a digest’s queue holds, whenever it changed', async () => {
    const [newest] = episodesInOrder(db, show2.id);
    const r = await reader([
      episodeStarted(newest!, show2, 600 * MINUTE),
      bookStarted(bookRef, 2 * MINUTE),
    ]);
    // With no Auralis play of it, it is not heard at all.
    expect(upNext(await composeFeed(r, [], [newest!]))).toEqual([bookRef.id]);
    // Your own play of it before still counts, at when you played it, not at the digest's sync.
    expect(upNext(await composeFeed(r, [play(newest!, MINUTE)], [newest!]))).toEqual([
      bookRef.id,
      newest!.id,
    ]);
    // Out of every digest's queue, the progress is yours.
    expect(upNext(await composeFeed(r, []))).toEqual([newest!.id, bookRef.id]);
  });

  it('[M2.sorting/b] skips an episode a digest finished as played', async () => {
    const r = await reader([episodeFinished(one, show1), episodeFinished(two, show1)]);
    const feed = await composeFeed(r, [play(two, 3000, { list: 'the-digest' }), play(one, 2000)]);
    expect(upNext(feed)).toEqual([three.id]);
  });

  it('[M2.sorting/b] leaves out what the index no longer holds, or a library you may not open', async () => {
    const r = await reader([bookStarted(bookRef), episodeStarted(two, show1)], {
      libraries: [booksLibrary],
    });
    const feed = await composeFeed(r, [
      play(ref('gone-from-the-index'), 5000),
      play(two, 4000),
      play(bookRef, 3000),
    ]);
    expect(upNext(feed)).toEqual([bookRef.id]);
    expect(feed.flatMap((s) => s.items).every((c) => c.availability.kind === 'owned')).toBe(true);
  });

  it('[M2.sorting/b] keeps your second most recent book and show, each by its own kind', async () => {
    const [newest] = episodesInOrder(db, show2.id);
    const r = await reader([
      bookStarted(book1),
      bookStarted(bookRef),
      episodeStarted(two, show1),
      episodeStarted(newest!, show2),
    ]);
    const feed = await composeFeed(r, [
      play(newest!, 6000),
      play(two, 5000),
      play(bookRef, 2000),
      play(book1, 1000),
    ]);
    expect(upNext(feed)).toEqual([newest!.id, two.id, bookRef.id, book1.id]);
    // However many shows came after it, the paused book stays.
    expect(secondRecent(feed)).toEqual([two.id, book1.id]);
  });

  it('[M2.sorting/b] gives the second shelf a card Up next leads with only once', async () => {
    const [copy] = bookCopies(1);
    applyTree(db, absTree(copy!), 1, emptyCounts());
    const r = await reader([
      bookStarted(book2),
      bookFinished(bookRef),
      bookFinished(book1),
      bookStarted(ref(copy!.id)),
    ]);
    const feed = await composeFeed(r, [
      play(book2, 4000),
      play(bookRef, 3000),
      play(book1, 2000),
      play(ref(copy!.id), 1000),
    ]);
    expect(upNext(feed)).toEqual([book2.id, copy!.id]);
    // The used-up book and the one leading to the same card as the newest fall through.
    expect(secondRecent(feed)).toEqual([copy!.id]);

    const twoBooks = await composeFeed(await reader([bookStarted(book2), bookFinished(book1)]), [
      play(book2, 4000),
      play(book1, 2000),
    ]);
    expect(secondRecent(twoBooks)).toBeNull();
  });

  it('[M2.sorting/b] leaves the second shelf out when there is no second book or show', async () => {
    const r = await reader([bookStarted(bookRef), episodeStarted(two, show1)]);
    const feed = await composeFeed(r, [play(two, 2000), play(bookRef, 1000)]);
    expect(feed.map((s) => s.id)).toEqual(['up-next']);
  });

  it('[M2.sorting/b] is empty with nothing listened to, or no Audiobookshelf link', async () => {
    expect(await composeFeed(await reader(), [])).toEqual([]);
    const unlinked: Reader = { ...(await reader()), access: null };
    expect(await composeFeed(unlinked, [play(bookRef, 1000)])).toEqual([]);
  });
});
