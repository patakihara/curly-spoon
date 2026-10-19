/**
 * The lists routes and the digest rule, through the real routes, on the recorded index and
 * upstreams of lists/testServer.ts.
 */
import {
  LIST_ENTRIES_MAX,
  ListDetail,
  ListeningSession,
  ListeningSessionList,
  Queue,
  type MediaRef,
  type QueueItem,
} from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DIGEST_NEW_DAYS } from './lists/rules.js';
import {
  at,
  book,
  bookRef,
  booksLibrary,
  DAY,
  DEC_20,
  finishedEpisode,
  four,
  grantedOnly,
  index,
  karaMe,
  listsServer,
  meFinished,
  one,
  ref,
  refused,
  SEPT_15,
  show1,
  show2,
  shows,
  three,
  two,
} from './lists/testServer.js';
import { openDatabase, type Db } from './store/connection.js';
import { listLists, markPlayed, setListItems } from './store/lists.js';
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

const server = async (options: Parameters<typeof listsServer>[1] = {}) => {
  const s = await listsServer(db, options);
  apps.push(s.app);
  return s;
};

describe('[M2.lists/b] The Digest: subscribed shows’ unplayed episodes of the last 14 days', () => {
  it('[M2.lists/b] holds every show’s new unplayed episodes oldest first, leaving out the finished one and older ones', async () => {
    const s = await server();

    const [digest, ...rest] = await s.lists();
    const opened = await s.detail(digest!.id);

    expect(rest).toEqual([]);
    expect(digest).toMatchObject({ kind: 'digest', name: 'The Digest', theDigest: true });
    expect(digest!.order).toBe('oldest');
    // Part One came out on 5 September too, but kara finished it; show 2's newest are from June
    // 2023, older than 14 days, and from 2025, not yet out.
    expect(s.refs(opened.items)).toEqual([two, three, four]);
    expect(digest!.count).toBe(3);
    expect(opened.items.map((i) => i.publishedAt)).toEqual([at(two), at(three), at(four)]);
    expect(opened.items[0]).toMatchObject({
      kind: 'episode',
      sub: shows[0]!.media.metadata.title,
      art: `/api/media/abs:${show1.id}/art`,
      finished: false,
    });
    expect(opened.shows.map((e) => e.ref)).toEqual(
      [shows[0]!, shows[1]!]
        .sort((a, b) => a.media.metadata.title.localeCompare(b.media.metadata.title))
        .map((show) => ref(show.id)),
    );
    expect(opened.items.some((i) => i.ref.id === finishedEpisode.episodeId)).toBe(false);
  });

  it('[M2.lists/b] drops an episode once it is older than 14 days, to the moment', async () => {
    const s = await server({ now: at(three) + DIGEST_NEW_DAYS * DAY });
    const digest = await s.theDigest();

    expect(DIGEST_NEW_DAYS).toBe(14);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([four]);
    s.clock.now -= 1;
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three, four]);
  });

  it('[M2.lists/b] leaves out an episode finished on Audiobookshelf and keeps one in progress', async () => {
    const me = karaMe([
      { episodeId: three.id, isFinished: true, progress: 1 },
      { id: 'in-progress', episodeId: two.id, isFinished: false, progress: 0.4 },
    ]);
    const s = await server({ me });

    const opened = await s.detail((await s.theDigest()).id);

    expect(s.refs(opened.items)).toEqual([one, two, four]);
    expect(opened.items[1]).toMatchObject({ progress: 0.4, finished: false });
  });

  it('[M2.lists/b] leaves out an episode Auralis marked played, unless Audiobookshelf changed it since', async () => {
    const lastUpdate = finishedEpisode.lastUpdate!;
    const me = karaMe([{ episodeId: three.id, isFinished: false, progress: 0.3, lastUpdate }]);
    const s = await server({ me });
    markPlayed(db, s.users.kara!, four, 1);
    markPlayed(db, s.users.kara!, three, lastUpdate - 1);

    const opened = await s.detail((await s.theDigest()).id);

    expect(s.refs(opened.items)).toEqual([one, two, three]);
    markPlayed(db, s.users.kara!, three, lastUpdate + 1);
    expect(s.refs((await s.detail(opened.id)).items)).toEqual([one, two]);
  });

  it('[M2.lists/b] holds no show of a library the person may not open', async () => {
    const s = await server();

    const opened = await s.detail((await s.theDigest('otto')).id, 'otto');

    expect(opened.shows).toEqual([]);
    expect(opened.items).toEqual([]);
  });

  it('[M2.lists/b] plays newest first once turned round, and keeps that', async () => {
    const s = await server();
    const digest = await s.theDigest();

    const turned = s.ok(
      await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest' }),
      ListDetail,
    );

    expect(turned.order).toBe('newest');
    expect(s.refs(turned.items)).toEqual([four, three, two]);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([four, three, two]);
  });
});

describe('[M2.lists/c] a custom digest over the shows you choose', () => {
  it('[M2.lists/c] holds only its shows’ new unplayed episodes, in its order, and follows a change of shows', async () => {
    const s = await server({ now: DEC_20 });
    const show2Episodes = shows[1]!.media
      .episodes!.map((e) => ref(e.id))
      .filter((e) => at(e) > DEC_20 - 14 * DAY && at(e) <= DEC_20)
      .sort((a, b) => at(a) - at(b));

    const made = await s.create({ kind: 'digest', name: 'Work', shows: [show2] });

    expect(made).toMatchObject({ kind: 'digest', name: 'Work', theDigest: false, order: 'oldest' });
    expect(made.shows.map((e) => e.ref)).toEqual([show2]);
    expect(show2Episodes).toHaveLength(2);
    expect(s.refs(made.items)).toEqual(show2Episodes);

    s.clock.now = SEPT_15;
    expect((await s.detail(made.id)).items).toEqual([]);
    const changed = s.ok(
      await s.call('PATCH', `/lists/${made.id}`, { shows: [show1] }),
      ListDetail,
    );
    expect(changed.shows.map((e) => e.ref)).toEqual([show1]);
    expect(s.refs(changed.items)).toEqual([two, three, four]);
    expect((await s.lists()).map((l) => [l.name, l.count])).toEqual([
      ['The Digest', 3],
      ['Work', 3],
    ]);
  });
});

describe('the lists routes', () => {
  it('makes, renames, fills, reorders and deletes a playlist', async () => {
    const s = await server();

    const made = await s.create({ kind: 'playlist', name: 'Drive' });
    expect(made).toMatchObject({ kind: 'playlist', theDigest: false, order: null, count: 0 });
    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest', 'Drive']);

    s.ok(await s.call('PATCH', `/lists/${made.id}`, { name: 'Commute' }), ListDetail);
    s.ok(await s.call('POST', `/lists/${made.id}/items`, { ref: two }), ListDetail);
    const filled = s.ok(await s.call('POST', `/lists/${made.id}/items`, { ref: four }), ListDetail);
    expect(s.refs(filled.items)).toEqual([two, four]);
    const turned = s.ok(
      await s.call('PUT', `/lists/${made.id}/items`, { refs: [four, two] }),
      ListDetail,
    );
    expect(turned).toMatchObject({ name: 'Commute', count: 2 });
    expect(s.refs(turned.items)).toEqual([four, two]);
    expect(turned.shows).toEqual([]);

    expect(await s.call('DELETE', `/lists/${made.id}`)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await s.call('GET', `/lists/${made.id}`)).toEqual(refused(404, 'not_found'));
    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest']);
  });

  it('keeps an entry or show named twice once, where first named', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Drive' });

    const put = s.ok(
      await s.call('PUT', `/lists/${list.id}/items`, { refs: [two, four, two] }),
      ListDetail,
    );
    const again = s.ok(await s.call('POST', `/lists/${list.id}/items`, { ref: two }), ListDetail);
    const digest = await s.create({ kind: 'digest', name: 'Work', shows: [show1, show1] });

    expect(s.refs(put.items)).toEqual([two, four]);
    expect(s.refs(again.items)).toEqual([two, four]);
    expect(digest.shows.map((e) => e.ref)).toEqual([show1]);
  });

  it('refuses The Digest a name, shows, entries or deletion, changing nothing, but turns its order', async () => {
    const s = await server();
    const digest = await s.theDigest();
    const fixed = refused(400, 'fixed_list');

    expect(await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest', name: 'Mine' })).toEqual(
      fixed,
    );
    expect(
      await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest', shows: [show1] }),
    ).toEqual(fixed);
    expect(await s.call('POST', `/lists/${digest.id}/items`, { ref: show1 })).toEqual(fixed);
    expect(await s.call('PUT', `/lists/${digest.id}/items`, { refs: [] })).toEqual(fixed);
    expect(await s.call('DELETE', `/lists/${digest.id}`)).toEqual(fixed);

    expect(await s.theDigest()).toEqual(digest);
    expect(
      s.ok(await s.call('PATCH', `/lists/${digest.id}`, { order: 'newest' }), ListDetail).order,
    ).toBe('newest');
  });

  it('refuses an entry a list does not take, and an order or shows off a digest, changing nothing', async () => {
    const s = await server();
    const wrong = refused(400, 'wrong_kind');
    const playlist = await s.create({ kind: 'playlist', name: 'Drive' });
    const listening = await s.create({ kind: 'listening', name: 'Books' });
    const digest = await s.create({ kind: 'digest', name: 'Work', shows: [show1] });

    expect(await s.call('POST', `/lists/${playlist.id}/items`, { ref: show1 })).toEqual(wrong);
    expect(await s.call('POST', `/lists/${playlist.id}/items`, { ref: bookRef })).toEqual(wrong);
    expect(await s.call('PUT', `/lists/${listening.id}/items`, { refs: [bookRef, two] })).toEqual(
      wrong,
    );
    expect(await s.call('POST', '/lists', { kind: 'digest', name: 'X', shows: [two] })).toEqual(
      wrong,
    );
    expect(
      await s.call('POST', '/lists', { kind: 'playlist', name: 'X', order: 'newest' }),
    ).toEqual(wrong);
    expect(await s.call('POST', '/lists', { kind: 'listening', name: 'X', shows: [] })).toEqual(
      wrong,
    );
    expect(await s.call('PATCH', `/lists/${playlist.id}`, { name: 'Y', order: 'newest' })).toEqual(
      wrong,
    );
    expect(await s.call('PATCH', `/lists/${digest.id}`, { name: 'Y', shows: [bookRef] })).toEqual(
      wrong,
    );
    expect(await s.call('POST', `/lists/${digest.id}/items`, { ref: show2 })).toEqual(wrong);

    expect((await s.lists()).map((l) => l.name)).toEqual(['The Digest', 'Drive', 'Books', 'Work']);
    expect((await s.detail(listening.id)).items).toEqual([]);
    expect((await s.detail(digest.id)).shows.map((e) => e.ref)).toEqual([show1]);
  });

  it('refuses an empty name, and an entry not indexed or in a library the person may not open', async () => {
    const s = await server();
    const mine = await s.create({ kind: 'playlist', name: 'Drive' });
    const ottos = await s.create({ kind: 'playlist', name: 'Drive' }, 'otto');

    expect(await s.call('POST', '/lists', { kind: 'playlist', name: ' ' })).toEqual(
      refused(400, 'bad_request'),
    );
    expect(await s.call('POST', `/lists/${mine.id}/items`, { ref: ref('not-indexed') })).toEqual(
      refused(404, 'not_found'),
    );
    expect(await s.call('POST', `/lists/${ottos.id}/items`, { ref: two }, 'otto')).toEqual(
      refused(404, 'not_found'),
    );
    expect(
      await s.call('POST', '/lists', { kind: 'digest', name: 'X', shows: [show1] }, 'otto'),
    ).toEqual(refused(404, 'not_found'));
  });

  it('answers 404 to every call on another person’s list', async () => {
    const s = await server();
    const mine = await s.create({ kind: 'playlist', name: 'Drive' });
    const missing = refused(404, 'not_found');

    expect(await s.call('GET', `/lists/${mine.id}`, undefined, 'otto')).toEqual(missing);
    expect(await s.call('PATCH', `/lists/${mine.id}`, { name: 'Ha' }, 'otto')).toEqual(missing);
    expect(await s.call('POST', `/lists/${mine.id}/items`, { ref: two }, 'otto')).toEqual(missing);
    expect(await s.call('PUT', `/lists/${mine.id}/items`, { refs: [] }, 'otto')).toEqual(missing);
    expect(await s.call('DELETE', `/lists/${mine.id}`, undefined, 'otto')).toEqual(missing);
    expect((await s.detail(mine.id)).name).toBe('Drive');
  });

  it('leaves a played episode out of a playlist without taking it off', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Drive' });
    s.ok(await s.call('PUT', `/lists/${list.id}/items`, { refs: [one, two] }), ListDetail);

    const opened = await s.detail(list.id);
    markPlayed(db, s.users.kara!, two, 1);

    expect(s.refs(opened.items)).toEqual([two]);
    expect((await s.detail(list.id)).items).toEqual([]);
    const added = s.ok(await s.call('POST', `/lists/${list.id}/items`, { ref: three }), ListDetail);
    expect(s.refs(added.items)).toEqual([three]);
  });

  it('crosses a finished book off a listening list, keeping it', async () => {
    const me = karaMe([{ libraryItemId: book.id, episodeId: null, isFinished: true, progress: 1 }]);
    const s = await server({ me });
    const list = await s.create({ kind: 'listening', name: 'Books' });

    const filled = s.ok(
      await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] }),
      ListDetail,
    );

    expect(filled.items.map((i) => [i.ref, i.kind, i.finished])).toEqual([
      [bookRef, 'book', true],
      [show1, 'show', false],
    ]);
    expect(filled.items[0]).toMatchObject({ title: book.media.metadata.title, progress: 1 });
    expect(filled.items[1]).toMatchObject({ publishedAt: null, duration: null, progress: null });
  });

  it('crosses off a show on a listening list once every episode of it is finished', async () => {
    const me = karaMe(
      [one, two, three, four].map((e, i) => ({ id: `p${i}`, episodeId: e.id, isFinished: true })),
    );
    const s = await server({ me });
    const list = await s.create({ kind: 'listening', name: 'Shows' });

    const filled = s.ok(
      await s.call('POST', `/lists/${list.id}/items`, { ref: show1 }),
      ListDetail,
    );

    expect(filled.items.map((i) => i.finished)).toEqual([true]);
  });

  it('answers 404 for an entry outside the person’s libraries, whatever its kind', async () => {
    const s = await server();
    const ottos = await s.create({ kind: 'listening', name: 'Books' }, 'otto');
    const missing = refused(404, 'not_found');

    expect(await s.call('POST', `/lists/${ottos.id}/items`, { ref: two }, 'otto')).toEqual(missing);
    expect(await s.call('PUT', `/lists/${ottos.id}/items`, { refs: [show1] }, 'otto')).toEqual(
      missing,
    );
    expect(
      await s.call('POST', '/lists', { kind: 'digest', name: 'X', shows: [two] }, 'otto'),
    ).toEqual(missing);
  });

  it('leaves out entries of a library the person may no longer open, and brings them back with access', async () => {
    const s = await server();
    const books = await s.create({ kind: 'listening', name: 'Books' });
    const drive = await s.create({ kind: 'playlist', name: 'Drive' });
    const work = await s.create({ kind: 'digest', name: 'Work', shows: [show1] });
    s.ok(await s.call('PUT', `/lists/${books.id}/items`, { refs: [bookRef, show1] }), ListDetail);
    s.ok(await s.call('PUT', `/lists/${drive.id}/items`, { refs: [two, three] }), ListDetail);

    s.karaAnswers(grantedOnly([booksLibrary]));

    expect(s.refs((await s.detail(books.id)).items)).toEqual([bookRef]);
    expect((await s.detail(drive.id)).items).toEqual([]);
    expect(await s.detail(work.id)).toMatchObject({ shows: [], items: [] });
    const digest = await s.detail((await s.theDigest()).id);
    expect(digest).toMatchObject({ shows: [], items: [] });
    expect((await s.lists()).map((l) => l.count)).toEqual([0, 1, 0, 0]);

    s.karaAnswers(meFinished);
    expect(s.refs((await s.detail(drive.id)).items)).toEqual([two, three]);
    expect(s.refs((await s.detail(books.id)).items)).toEqual([bookRef, show1]);
  });

  it('refuses an entry past the most a list holds', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Long' });
    const full = Array.from({ length: LIST_ENTRIES_MAX }, (_, i) => ref(`gone-${i}`));
    setListItems(db, s.users.kara!, list.id, full);

    expect(await s.call('POST', `/lists/${list.id}/items`, { ref: two })).toEqual(
      refused(400, 'list_full'),
    );
    setListItems(db, s.users.kara!, list.id, full.slice(1));
    expect(
      s.refs(s.ok(await s.call('POST', `/lists/${list.id}/items`, { ref: two }), ListDetail).items),
    ).toEqual([two]);
  });

  it('makes The Digest on any call to the lists, not only on listing them', async () => {
    const s = await server();

    await s.create({ kind: 'playlist', name: 'Drive' });

    expect(listLists(db, s.users.kara!).map((l) => l.theDigest)).toEqual([true, false]);
  });
});

describe('[M2.lists/a] Playing a listening list or a podcast playlist, in order', () => {
  /** What the spoken queue plays, in order, from its current entry: refs, a book's chapters. */
  const entries = (q: Queue) =>
    [q.current!, ...q.user].map(({ ref, chapter }: QueueItem) => ({ ref, chapter }));
  type Entry = { ref: MediaRef; chapter: number | undefined };
  const chapter = (n: number): Entry => ({ ref: bookRef, chapter: n });
  const episode = (e: MediaRef): Entry => ({ ref: e, chapter: undefined });

  async function played(s: Awaited<ReturnType<typeof server>>, id: string, body: object = {}) {
    return s.ok(await s.call('POST', `/lists/${id}/play`, body), Queue);
  }
  /** Next, as the end of an entry or the button sends it, answering what the spoken queue is on. */
  async function next(s: Awaited<ReturnType<typeof server>>) {
    const session = s.ok(
      await s.call('POST', '/sessions/this/step', { direction: 'next' }),
      ListeningSession,
    );
    const { ref, chapter } = session.currents.spoken!;
    return { ref, chapter };
  }

  it('[M2.lists/a] a listening list of a book and a show plays the book’s chapters, then the show’s unplayed episodes in its order', async () => {
    const s = await server();
    const list = await s.create({ kind: 'listening', name: 'Road trip' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] });

    const queue = await played(s, list.id);

    // kara finished Part One; the serial show plays the rest from the oldest.
    const order = [...[0, 1, 2, 3].map(chapter), ...[two, three, four].map(episode)];
    expect(entries(queue)).toEqual(order);
    expect(queue.digest).toBeNull();
    // The client then plays the current entry: the session keeps the list's queue.
    expect(await s.call('POST', '/play', { ref: bookRef })).toMatchObject({ status: 200 });
    const walked = [];
    for (let n = 1; n < order.length; n += 1) walked.push(await next(s));
    expect(walked).toEqual(order.slice(1));
  });

  it('[M2.lists/a] a podcast playlist plays its episodes in the order picked, leaving out the played one', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Commute' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [two, one, four] });

    const queue = await played(s, list.id);

    expect(entries(queue)).toEqual([two, four].map(episode));
    expect(await s.call('POST', '/play', { ref: two })).toMatchObject({ status: 200 });
    const after = s.ok(await s.call('GET', '/queues/spoken'), Queue);
    expect([after.current, ...after.user].map((i) => i!.itemId)).toEqual(
      [queue.current, ...queue.user].map((i) => i!.itemId),
    );
    expect(await next(s)).toEqual(episode(four));
  });

  it('[M2.lists/a] skips a finished book, and plays it from its beginning when started on', async () => {
    const me = karaMe([{ libraryItemId: book.id, episodeId: null, isFinished: true, progress: 1 }]);
    const listed = async () => {
      const s = await server({ me });
      const list = await s.create({ kind: 'listening', name: 'Again' });
      await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] });
      return { s, list };
    };

    const first = await listed();
    const skipped = await played(first.s, first.list.id);
    expect(entries(skipped)).toEqual([one, two, three, four].map(episode));

    // Started on, from a new device with nothing queued, so the queue is the list's alone.
    const { s, list } = await listed();
    const again = await played(s, list.id, { start: bookRef });
    expect(entries(again)).toEqual([
      ...[0, 1, 2, 3].map(chapter),
      ...[one, two, three, four].map(episode),
    ]);
    expect(again.position).toEqual({ ms: 0, takenAt: s.clock.now });
  });

  it('[M2.lists/a] plays a finished episode started on, then the playlist’s unplayed ones after it', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Again' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [two, one, three] });

    const queue = await played(s, list.id, { start: one });

    // kara finished Part One.
    expect(entries(queue)).toEqual([one, three].map(episode));
    expect(queue.position).toEqual({ ms: 0, takenAt: s.clock.now });
  });

  it('plays from no item: a list play sets no playing-from, over the one before it too', async () => {
    const s = await server();
    await s.call('POST', '/queues/spoken/items', { ref: four, how: 'now' });
    const list = await s.create({ kind: 'listening', name: 'Road trip' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] });

    const queue = await played(s, list.id);

    expect(queue.context).toBeNull();
  });

  it('reads the chapters of only the books that will play', async () => {
    const s = await server();
    const list = await s.create({ kind: 'listening', name: 'Road trip' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [bookRef, show1] });

    await played(s, list.id, { start: show1 });

    expect(s.sent.filter((call) => call.includes(book.id))).toEqual([]);
  });

  it('pauses music with its current item kept, and drives the spoken queue', async () => {
    const s = await server();
    const song: MediaRef = { source: 'jellyfin', id: '0'.repeat(32) };
    await s.call('POST', '/queues/music/items', { ref: song, how: 'now' });
    const list = await s.create({ kind: 'playlist', name: 'Commute' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [two] });

    await played(s, list.id);

    const session = s.ok(await s.call('GET', '/sessions'), ListeningSessionList).sessions[0]!;
    expect(session.active).toBe('spoken');
    expect(session.currents.music?.ref).toEqual(song);
    expect(session.currents.spoken?.ref).toEqual(two);
  });

  it('[M2.lists/a] a playlist played from one of its episodes leaves out the ones before it', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Commute' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [two, three, four] });

    const queue = await played(s, list.id, { start: three });

    expect(entries(queue)).toEqual([three, four].map(episode));
  });

  it('plays the list in place of what the spoken queue held, keeping what was queued after it', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Commute' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [four] });
    await s.call('POST', '/queues/spoken/items', { ref: two, how: 'now' });
    await s.call('POST', '/queues/spoken/items', { ref: three, how: 'end' });

    const queue = await played(s, list.id);

    expect(entries(queue)).toEqual([four, three].map(episode));
  });

  it('refuses a start not on the list, a list with nothing left, someone else’s list, and a stale revision', async () => {
    const s = await server();
    const list = await s.create({ kind: 'playlist', name: 'Commute' });
    await s.call('PUT', `/lists/${list.id}/items`, { refs: [two] });
    const empty = await s.create({ kind: 'listening', name: 'Later' });

    expect(await s.call('POST', `/lists/${list.id}/play`, { start: three })).toEqual(
      refused(404, 'not_found'),
    );
    expect(await s.call('POST', `/lists/${empty.id}/play`, {})).toEqual(
      refused(400, 'nothing_to_play'),
    );
    // Part One is the one kara finished.
    const finished = await s.create({ kind: 'playlist', name: 'Done' });
    await s.call('PUT', `/lists/${finished.id}/items`, { refs: [one] });
    expect(await s.call('POST', `/lists/${finished.id}/play`, {})).toEqual(
      refused(400, 'nothing_to_play'),
    );
    expect(await s.call('POST', `/lists/${list.id}/play`, {}, 'otto')).toEqual(
      refused(404, 'not_found'),
    );
    expect(await s.call('POST', `/lists/${list.id}/play`, { rev: 99 })).toEqual(
      refused(409, 'stale_revision'),
    );
  });
});
