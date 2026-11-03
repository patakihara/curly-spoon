/**
 * `GET /api/feed` through the real routes, on the recorded index and upstreams of
 * adapters/http/listsServer.ts: kara listens on both her devices, then plays a digest of show 2,
 * and Browse's shelves hold only what she owns from her own listening, whatever the digest played
 * or Audiobookshelf synced for it. The clock stands at 20 December 2021, inside show 2's run, so a
 * digest of show 2 holds its two newest episodes.
 */
import { Feed, type FeedCard, type MediaRef } from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AbsMe,
  book,
  bookRef,
  booksLibrary,
  DAY,
  DEC_20,
  grantedOnly,
  index,
  karaMe,
  listsServer,
  meFinished,
  ref,
  refused,
  show1,
  show2,
  shows,
  three,
  two,
} from './adapters/http/listsServer.js';
import { DIGEST_SYNC_MS } from './feed/upNext.js';
import { openDatabase, type Db } from './store/connection.js';
import { openSession, saveSession } from './store/listening.js';

let apps: FastifyInstance[] = [];
let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
  index(db);
});
afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps = [];
  db.close();
});

/** One of show 2's episodes, in no digest at this time. */
const elsewhere = ref(shows[1]!.media.episodes[0]!.id);

/** When each step happens, from the clock's start. */
const T = {
  elsewhere: DEC_20 + 500,
  two: DEC_20 + 1500,
  book: DEC_20 + 2500,
  digestPlay: DEC_20 + 4500,
};

type Progress = Partial<AbsMe['mediaProgress'][number]> & { currentTime?: number };
const episodeStarted = (episode: MediaRef, lastUpdate: number): Progress => ({
  libraryItemId: show2.id,
  episodeId: episode.id,
  isFinished: false,
  progress: 0.4,
  currentTime: 600,
  lastUpdate,
});

async function server() {
  const s = await listsServer(db, { now: DEC_20 });
  apps.push(s.app);
  const add = async (r: MediaRef, how: 'now' | 'next', device = 'kara') =>
    expect(await s.call('POST', '/queues/spoken/items', { ref: r, how }, device)).toMatchObject({
      status: 200,
    });
  /** A play started on the device, as the player sends it. */
  const play = async (r: MediaRef, device = 'kara') =>
    expect(await s.call('POST', '/play', { ref: r }, device)).toMatchObject({ status: 200 });
  /** The player steps on at `at`: the current item becomes a play in the device's history. */
  const next = async (at: number, device = 'kara') => {
    s.clock.now = at;
    expect(
      await s.call('POST', '/sessions/this/step', { direction: 'next' }, device),
    ).toMatchObject({ status: 200 });
  };
  const feed = async (name = 'kara') => s.ok(await s.call('GET', '/feed', undefined, name), Feed);
  return { ...s, add, play, next, feed };
}

const shelf = (feed: Feed, id: 'up-next' | 'second-recent') =>
  feed.shelves.find((x) => x.id === id)?.items ?? [];
const refs = (cards: FeedCard[]) => cards.map((c) => c.ref);

describe('[M2.sorting/b] Browse’s shelves hold only owned items from your own history', () => {
  it('[M2.sorting/b] Up next and the second shelf follow your plays on both devices, never a digest’s play or what Audiobookshelf synced for it', async () => {
    const s = await server();
    // Your own listening: one of show 2's episodes, then show 1's Part Two on this device, and the
    // book on the phone.
    await s.add(elsewhere, 'now');
    await s.next(T.elsewhere);
    await s.add(two, 'now');
    await s.play(two);
    await s.next(T.two);
    await s.add(bookRef, 'now', 'kara-phone');
    await s.play(bookRef, 'kara-phone');
    await s.next(T.book, 'kara-phone');

    // Then a digest of show 2: its first episode plays and the player steps on to the second.
    const digest = await s.create({ kind: 'digest', name: 'Show 2', shows: [show2] });
    const [first, second] = s.refs(digest.items) as [MediaRef, MediaRef];
    expect(digest.items).toHaveLength(2);
    expect([first, second]).not.toContainEqual(elsewhere);
    expect(await s.call('POST', `/lists/${digest.id}/play`, {})).toMatchObject({ status: 200 });
    await s.next(T.digestPlay);

    // Audiobookshelf has the digest's first episode synced five minutes after its play stopped,
    // the second (current in the digest's queue) a day later, and the book where the phone left it.
    s.karaAnswers(
      karaMe([
        episodeStarted(first, T.digestPlay + DIGEST_SYNC_MS / 2),
        episodeStarted(second, T.digestPlay + DAY),
        {
          libraryItemId: bookRef.id,
          episodeId: null,
          isFinished: false,
          progress: 0.25,
          currentTime: 300,
          lastUpdate: T.book + 100,
        } as Progress,
      ]),
    );

    const feed = await s.feed();
    expect(feed.shelves.map((x) => x.id)).toEqual(['up-next', 'second-recent']);
    // Newest first across devices; show 2 stays where your own play left it.
    expect(refs(shelf(feed, 'up-next'))).toEqual([bookRef, two, elsewhere]);
    // The second most recent show is show 2, its card not the one show 1 leads with; one book.
    expect(refs(shelf(feed, 'second-recent'))).toEqual([elsewhere]);
    const all = feed.shelves.flatMap((x) => refs(x.items));
    expect(all).not.toContainEqual(first);
    expect(all).not.toContainEqual(second);

    const [bookCard, twoCard] = shelf(feed, 'up-next');
    expect(bookCard).toEqual({
      ref: bookRef,
      kind: 'book',
      title: book.media.metadata.title,
      sub: expect.any(String),
      art: expect.stringMatching(/^\/api\//),
      progress: 0.25,
      availability: { kind: 'owned' },
    });
    expect(twoCard).toMatchObject({
      kind: 'episode',
      sub: shows[0]!.media.metadata.title,
      art: `/api/media/abs:${show1.id}/art`,
      progress: null,
    });
    for (const card of feed.shelves.flatMap((x) => x.items)) {
      expect(card.availability).toEqual({ kind: 'owned' });
    }

    // Back to your own queue: Play now of its current, Part Three, puts the digest's aside. The
    // second episode's progress, a day after the digest last played, is your own listening now.
    s.clock.now = T.digestPlay + 1000;
    await s.add(three, 'now');
    expect(openSession(db, s.users.kara!, s.devices.kara!, s.clock.now)!.saved).toMatchObject([
      { owner: digest.id, queue: { current: { ref: second } } },
    ]);
    expect(refs(shelf(await s.feed(), 'up-next'))[0]).toEqual(second);
  });

  it('[M2.sorting/b] leaves out a play of what the index no longer holds, or of a library you may not open', async () => {
    const s = await server();
    await s.add(two, 'now');
    await s.play(two);
    await s.next(T.two);
    await s.add(bookRef, 'now', 'kara-phone');
    await s.play(bookRef, 'kara-phone');
    await s.next(T.book, 'kara-phone');
    const phone = openSession(db, s.users.kara!, s.devices['kara-phone']!, T.book)!;
    const seq = Math.max(...phone.history.map((p) => p.seq)) + 1;
    saveSession(db, s.users.kara!, s.devices['kara-phone']!, phone.rev, {
      ...phone,
      history: [
        ...phone.history,
        { seq, queue: 'spoken', ref: ref('gone-from-the-index'), playedAt: T.book + 1 },
      ],
    });
    s.karaAnswers(karaMe([]));
    expect(refs(shelf(await s.feed(), 'up-next'))).toEqual([bookRef, two]);

    // Granted only the books library: show 1 is no longer yours to open.
    s.karaAnswers(grantedOnly([booksLibrary]));
    expect(await s.feed()).toEqual({
      shelves: [{ id: 'up-next', items: [expect.objectContaining({ ref: bookRef })] }],
    });
  });

  it('answers 502 upstream_failed when Audiobookshelf fails or cannot find the person', async () => {
    for (const status of [500, 404]) {
      const s = await server();
      const failing = structuredClone(meFinished);
      failing.response.status = status;
      s.karaAnswers(failing);
      expect(await s.call('GET', '/feed')).toEqual(refused(502, 'upstream_failed'));
    }
  });

  it('is empty for someone who listened to nothing, and 401 to a caller not signed in', async () => {
    const s = await server();
    expect(await s.feed('otto')).toEqual({ shelves: [] });
    const res = await s.app.inject({ method: 'GET', url: '/api/feed' });
    expect(res.statusCode).toBe(401);
  });
});
