/**
 * A digest's own queue, through the real routes, on the recorded index and upstreams of
 * adapters/http/listsServer.ts: playing a digest saves the spoken queue and puts the digest's in its
 * place, playing the saved queue's current episode (or its next, once that finished) brings it
 * back, and playing the digest, or one of its episodes, brings back the digest's queue. An episode
 * finished or skipped in a digest's queue is marked played, there and on Audiobookshelf, while your
 * own place in its show stays where it was. The clock stands just past 14 days after show 1's Part
 * Two came out, so The Digest holds Parts Three and Four; Part Two is the episode the recordings
 * play, and Parts One and Three the ones they mark finished.
 */
import {
  ListeningSession,
  ListeningSessionList,
  type MediaRef,
  Queue,
  QueueView,
  type QueuePosition,
} from '@auralis/schema';
import { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Recording } from './adapters/http/recording.js';
import { indexedRow } from './libraryIndex/store.js';
import { DIGEST_NEW_DAYS } from './lists/rules.js';
import {
  at,
  bookChapters,
  bookRef,
  DAY,
  four,
  index,
  karaMe,
  listsServer,
  markCall,
  markRecording,
  one,
  ref,
  refused,
  show1,
  shows,
  three,
  two,
} from './adapters/http/listsServer.js';
import { ownPlays } from './queues/autoplay.js';
import { MARK_FAILED } from './queues/sessions.js';
import { openDatabase, type Db } from './store/connection.js';
import { openSession, savePosition } from './store/listening.js';
import { playedMarks } from './store/lists.js';

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

/** Just past the moment Part Two stops being new: The Digest holds Parts Three and Four. */
const PAST_TWO = at(two) + DIGEST_NEW_DAYS * DAY + 1;
/** Just after Part Two came out, before Part Three: a digest of show 1 holds Part Two alone. */
const AFTER_TWO = at(two) + 1;
/** One of show 2's episodes, in no digest at either time. */
const elsewhere = ref(shows[1]!.media.episodes[0]!.id);

async function server(now = PAST_TWO, me?: Recording, abs?: Recording[]) {
  const s = await listsServer(db, {
    now,
    ...(me === undefined ? {} : { me }),
    ...(abs === undefined ? {} : { abs }),
  });
  apps.push(s.app);
  /** Each call is made from kara's device `device` (her first, unless named). */
  const queue = async (device = 'kara') =>
    s.ok(await s.call('GET', '/queues/spoken', undefined, device), QueueView);
  const session = async () =>
    s
      .ok(await s.call('GET', '/sessions'), ListeningSessionList)
      .sessions.find((x) => x.thisDevice)!;
  const add = async (ref: MediaRef, how: 'now' | 'next' | 'end', device = 'kara') =>
    s.ok(await s.call('POST', '/queues/spoken/items', { ref, how }, device), Queue);
  const playList = async (id: string, body: object = {}, device = 'kara') =>
    s.ok(await s.call('POST', `/lists/${id}/play`, body, device), Queue);
  /** A play started on the device, as the player sends it. */
  const play = async (ref: MediaRef, device = 'kara') =>
    expect(await s.call('POST', '/play', { ref }, device)).toMatchObject({ status: 200 });
  const next = async () =>
    s.ok(await s.call('POST', '/sessions/this/step', { direction: 'next' }), ListeningSession);
  /** Keeps a position in the spoken queue's current item, as a progress report does. */
  const at = async (ms: number, device = 'kara') => {
    const { current } = await queue(device);
    savePosition(db, s.users.kara!, s.devices[device]!, 'spoken', current!.itemId, {
      ms,
      takenAt: s.clock.now,
    });
  };
  const stored = (device = 'kara') =>
    openSession(db, s.users.kara!, s.devices[device]!, s.clock.now)!;
  /** The episodes kara has marked played, by ref key. */
  const marked = () => [...playedMarks(db, s.users.kara!).keys()];
  /** Every call made to mark an episode finished. */
  const marks = () => s.sent.filter((c) => c.startsWith('PATCH /api/me/progress/'));
  return { ...s, queue, session, add, playList, play, next, at, stored, marked, marks };
}

const refsOf = (q: { current: { ref: MediaRef } | null; user: { ref: MediaRef }[] }) => [
  q.current?.ref ?? null,
  ...q.user.map((i) => i.ref),
];
const ms = (p: QueuePosition | null) => p?.ms ?? null;
const keyOf = (r: MediaRef) => `${r.source}:${r.id}`;
/** The play session Audiobookshelf opened for Part Two, as `episode-play` recorded it. */
const playSession = 'a74dcbb8-7c0f-4f5b-a654-a8bac8c508fa';

describe('[M2.lists/d] an episode finished or skipped in a digest is marked played, and your place stays', () => {
  it('[M2.lists/d] finishing one and skipping another marks each played and takes it out of the digest, while that show’s Up next and autoplay stay on your own place', async () => {
    const s = await server(PAST_TWO, undefined, [markRecording(four)]);
    // Your own place in show 1: Part One played (Audiobookshelf has it finished), so Part Two
    // follows it.
    await s.add(one, 'now');
    await s.next();
    expect((await s.queue()).current?.ref).toEqual(two);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three, four]);

    await s.playList(digest.id);
    const length = indexedRow(db, 'abs', three.id)!.duration!;
    await s.at(Math.round((length - 1) * 1000));
    // Part Three ends: the player steps on.
    await s.next();
    await s.at(60_000);
    // Part Four is skipped a minute in.
    await s.next();

    await vi.waitFor(() => expect(s.marks()).toEqual([markCall(three), markCall(four)]));
    await vi.waitFor(() =>
      expect(playedMarks(db, s.users.kara!)).toEqual(
        new Map([
          [keyOf(three), expect.objectContaining({ confirmed: true })],
          [keyOf(four), expect.objectContaining({ confirmed: true })],
        ]),
      ),
    );
    expect((await s.detail(digest.id)).items).toEqual([]);
    // Up next reads your own plays: they still end on Part One.
    expect(ownPlays(s.stored()).map((p) => p.ref)).toEqual([one]);

    // With the digest gone, its queue plays on as your own: autoplay follows your own place.
    expect(await s.call('DELETE', `/lists/${digest.id}`)).toMatchObject({ status: 200 });
    await vi.waitFor(async () => expect((await s.queue()).autoplay?.ref).toEqual(two));
  });
});

describe('marking a digest’s episodes played', () => {
  it('closes the episode’s play session before marking it, so nothing Auralis sends after the mark undoes it', async () => {
    const s = await server(AFTER_TWO, undefined, [markRecording(two)]);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    await s.playList(digest.id);
    await s.add(bookRef, 'next');
    await s.play(two);

    await s.next();
    await vi.waitFor(() => expect(s.marks()).toEqual([markCall(two)]));
    // The next plan closes nothing more of Part Two's.
    await s.play(bookRef);

    const close = `POST /api/session/${playSession}/close`;
    expect(s.sent.filter((c) => c === close)).toHaveLength(1);
    expect(s.sent.indexOf(close)).toBeLessThan(s.sent.indexOf(markCall(two)));
    expect((await s.detail(digest.id)).items).toEqual([]);
  });

  it('marks an episode the device’s plan played through to the next one', async () => {
    const s = await server(AFTER_TWO);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    await s.playList(digest.id);
    await s.add(bookRef, 'next');
    await s.play(two);

    // Part Two's plan ends, and the player plays what follows it.
    await s.play(bookRef);

    expect((await s.queue()).current).toMatchObject({ ref: bookRef, chapter: 0 });
    expect(s.marked()).toEqual([keyOf(two)]);
    await vi.waitFor(() => expect(s.marks()).toEqual([markCall(two)]));
    expect((await s.detail(digest.id)).items).toEqual([]);
  });

  it('marks nothing it leaves on Play now of another item, or on the switch', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.playList(digest.id);
    await s.add(elsewhere, 'now');
    await s.playList(digest.id);
    expect(await s.call('PUT', '/sessions/this/active', { queue: 'music' })).toMatchObject({
      status: 200,
    });
    await s.playList(digest.id);
    // Play now of the digest's other episode, from within its queue.
    await s.add(four, 'now');

    expect((await s.queue()).current?.ref).toEqual(four);
    expect(s.marked()).toEqual([]);
    expect(s.marks()).toEqual([]);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three, four]);
  });

  it('plays what was put next in a digest’s queue as your own: unmarked, and it moves your place', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.playList(digest.id);
    await s.add(elsewhere, 'next');
    await s.add(bookRef, 'next');

    // Part Three, the book's chapters and show 2's episode, each stepped past.
    while ((await s.queue()).current?.ref.id !== four.id) await s.next();

    await vi.waitFor(() => expect(s.marks()).toEqual([markCall(three)]));
    expect(s.marked()).toEqual([keyOf(three)]);
    const plays = s.stored().history;
    expect(plays.filter((p) => p.list !== undefined).map((p) => p.ref)).toEqual([three]);
    expect(ownPlays(s.stored()).map((p) => p.ref)).toEqual([
      ...bookChapters.map(() => bookRef),
      elsewhere,
    ]);
  });

  it('logs a mark Audiobookshelf refused and holds it, then sends it again on the next step', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.playList(digest.id, { start: four });
    // Marking Part Four fails on Audiobookshelf.
    await s.next();
    await vi.waitFor(() => expect(s.logs.map((l) => l.msg)).toContain(MARK_FAILED));
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three]);

    // Later Audiobookshelf has Part Four changed since, unfinished: the mark it never took holds.
    s.clock.now += 60_000;
    const later = { isFinished: false, progress: 0.5, lastUpdate: s.clock.now };
    s.karaAnswers(karaMe([{}, { ...later, episodeId: four.id }]), [markRecording(four)]);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three]);

    // On the next step it is sent again, and taken.
    s.clock.now += 60_000;
    await s.next();
    await vi.waitFor(() =>
      expect(playedMarks(db, s.users.kara!).get(keyOf(four))).toMatchObject({ confirmed: true }),
    );
    expect(s.marks().filter((c) => c === markCall(four))).toHaveLength(2);
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([]);
  });
});

describe('[M2.lists/e] a digest plays in its own queue, and the queue it replaced comes back', () => {
  it('[M2.lists/e] saves the queue playing, and playing its current episode brings it back with its entries and position', async () => {
    const s = await server();
    const digest = await s.theDigest();
    expect(s.refs((await s.detail(digest.id)).items)).toEqual([three, four]);
    await s.add(two, 'now');
    await s.add(one, 'end');
    await s.at(61_000);
    const own = await s.queue();

    const played = await s.playList(digest.id);

    expect(played.digest).toBe(digest.id);
    expect(refsOf(played)).toEqual([three, four]);
    const inDigest = await s.queue();
    expect(inDigest.digest).toBe(digest.id);
    expect(refsOf(inDigest)).toEqual([three, four]);
    const [saved] = s.stored().saved;
    expect(saved).toMatchObject({ owner: null, queue: { position: { ms: 61_000 } } });
    expect(saved!.queue.current).toMatchObject({ itemId: own.current!.itemId, ref: two });

    await s.play(two);

    const back = await s.queue();
    expect(back.digest).toBeNull();
    expect(refsOf(back)).toEqual([two, one]);
    expect([back.current, ...back.user].map((i) => i!.itemId)).toEqual(
      [own.current, ...own.user].map((i) => i!.itemId),
    );
    expect(ms(back.position)).toBe(61_000);
    // The digest's queue is saved in its turn, on the episode it was left on.
    expect(s.stored().saved).toMatchObject([
      { owner: digest.id, queue: { current: { ref: three } } },
    ]);
  });

  it('[M2.lists/e] with the saved current at its end, 29 s from its end, playing its next entry brings the queue back and steps on to it', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(one, 'now');
    await s.add(two, 'end');
    const length = indexedRow(db, 'abs', one.id)!.duration!;
    await s.at(Math.round((length - 29) * 1000));

    await s.playList(digest.id);
    await s.play(two);

    const back = await s.queue();
    expect(back.digest).toBeNull();
    expect(refsOf(back)).toEqual([two]);
    expect(back.played.map((p) => p.ref)).toEqual([one]);
  });

  it('[M2.lists/e] does not step on from a saved current 31 s from its end', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(one, 'now');
    await s.add(two, 'end');
    const length = indexedRow(db, 'abs', one.id)!.duration!;
    await s.at(Math.round((length - 31) * 1000));

    await s.playList(digest.id);
    await s.play(two);

    // Part Two plays now in the digest's place, from your own queue left as it was.
    const now = await s.queue();
    expect(now.digest).toBeNull();
    expect(now.current?.ref).toEqual(two);
    expect(refsOf(now)).toEqual([two, two]);
  });

  it('[M2.lists/e] playing the digest again brings back its queue on the episode left, at its position', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(two, 'now');
    await s.playList(digest.id);
    await s.next();
    await s.at(30_000);
    const left = await s.queue();
    expect(left.current?.ref).toEqual(four);
    await s.play(two);

    const again = await s.playList(digest.id);

    expect(again.digest).toBe(digest.id);
    expect(again.current).toEqual({ itemId: left.current!.itemId, ref: four });
    expect(ms(again.position)).toBe(30_000);
    expect((await s.queue()).digest).toBe(digest.id);
  });

  it('[M2.lists/e] playing an episode from the digest’s page brings back its queue with that episode current', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(two, 'now');
    await s.playList(digest.id);
    await s.play(two);
    expect((await s.queue()).digest).toBeNull();

    const fromPage = await s.playList(digest.id, { start: four });

    expect(fromPage.digest).toBe(digest.id);
    expect(refsOf(fromPage)).toEqual([four, three]);
    expect(fromPage.position).toBeNull();
    // Your own queue is saved again, and comes back the same way.
    await s.play(two);
    expect(refsOf(await s.queue())).toEqual([two]);
  });

  it('[M2.lists/e] playing the saved digest queue’s current episode brings back the digest’s queue', async () => {
    const s = await server(AFTER_TWO);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    await s.add(elsewhere, 'now');
    await s.playList(digest.id);
    await s.add(three, 'now');
    expect((await s.queue()).digest).toBeNull();

    await s.play(two);

    const back = await s.queue();
    expect(back.digest).toBe(digest.id);
    expect(back.current?.ref).toEqual(two);
  });
});

describe('a digest’s queue', () => {
  it('Play now of an episode outside it goes back to your own queue first, keeping the digest’s', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(two, 'now');
    await s.add(one, 'end');
    await s.playList(digest.id);

    await s.add(elsewhere, 'now');

    const own = await s.queue();
    expect(own.digest).toBeNull();
    expect(refsOf(own)).toEqual([elsewhere, one]);
    expect(s.stored().saved).toMatchObject([
      { owner: digest.id, queue: { current: { ref: three } } },
    ]);
    // Play now of an episode in the digest's queue, from within it, stays in it.
    await s.playList(digest.id);
    await s.add(four, 'now');
    expect((await s.queue()).digest).toBe(digest.id);
  });

  it('keeps Play next as it was: an episode put next plays next in the digest’s queue', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.playList(digest.id);

    await s.add(elsewhere, 'next');

    const q = await s.queue();
    expect(q.digest).toBe(digest.id);
    expect(refsOf(q)).toEqual([three, elsewhere, four]);
  });

  it('pauses music with its current item kept, and drives the spoken queue', async () => {
    const s = await server();
    const song: MediaRef = { source: 'jellyfin', id: '0'.repeat(32) };
    await s.call('POST', '/queues/music/items', { ref: song, how: 'now' });

    await s.playList((await s.theDigest()).id);

    const session = await s.session();
    expect(session.active).toBe('spoken');
    expect(session.currents.music?.ref).toEqual(song);
    expect(session.currents.spoken?.ref).toEqual(three);
  });

  it('autoplays nothing when it runs out', async () => {
    const s = await server(AFTER_TWO);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    expect(at(two)).toBeLessThan(at(three));
    await s.playList(digest.id);
    expect((await s.queue()).autoplay).toBeNull();

    const ended = await s.next();

    expect(ended.currents.spoken).toBeNull();
    expect((await s.queue()).autoplay).toBeNull();
  });

  it('once its digest is deleted, plays on as your own queue, and autoplay follows it again', async () => {
    const s = await server(AFTER_TWO);
    const digest = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    await s.playList(digest.id);

    expect(await s.call('DELETE', `/lists/${digest.id}`)).toMatchObject({ status: 200 });

    await vi.waitFor(async () => {
      const own = await s.queue();
      expect(own.digest).toBeNull();
      expect(own.current?.ref).toEqual(two);
      // Part Two of the serial show is followed by Part Three.
      expect(own.autoplay?.ref).toEqual(three);
    });
    expect(s.stored().saved).toEqual([]);
  });

  it('keeps one saved queue per owner when moving between two digests', async () => {
    const s = await server();
    const theDigest = await s.theDigest();
    const custom = await s.create({ kind: 'digest', name: 'Show 1', shows: [show1] });
    await s.add(two, 'now');

    await s.playList(theDigest.id);
    await s.next();
    await s.playList(custom.id, { start: four });

    expect(s.stored().saved.map((q) => [q.owner, q.queue.current?.ref])).toEqual([
      [null, two],
      [theDigest.id, four],
    ]);
    expect((await s.playList(theDigest.id)).current?.ref).toEqual(four);
    expect(s.stored().saved.map((q) => q.owner)).toEqual([null, custom.id]);
  });

  it('refuses a start that is not one of the digest’s episodes, and a digest with none', async () => {
    const s = await server();
    const digest = await s.theDigest();
    const empty = await s.create({ kind: 'digest', name: 'Nothing', shows: [] });

    expect(await s.call('POST', `/lists/${digest.id}/play`, { start: two })).toEqual(
      refused(404, 'not_found'),
    );
    expect(await s.call('POST', `/lists/${empty.id}/play`, {})).toEqual(
      refused(400, 'nothing_to_play'),
    );
  });

  it('Play now of the saved queue’s current, from inside a digest, resumes it as playing it does', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(two, 'now');
    await s.add(one, 'end');
    await s.at(61_000);
    const own = await s.queue();
    await s.playList(digest.id);

    await s.add(two, 'now');

    const back = await s.queue();
    expect(back.digest).toBeNull();
    expect(back.current).toMatchObject({ itemId: own.current!.itemId, ref: two });
    expect(ms(back.position)).toBe(61_000);
    expect(refsOf(back)).toEqual([two, one]);
    expect(back.played).toEqual([]);
  });

  it('counts a book chapter finished by where the chapter ends in the book, not by its length', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(bookRef, 'now');
    await s.add(two, 'end');
    for (let n = 0; n < 3; n += 1) await s.next();
    const last = (await s.queue()).current!;
    expect(last).toMatchObject({ ref: bookRef, chapter: 3 });
    const chapter = bookChapters[3]!;
    // 5 s into the last chapter: past its own length from the book's start, far from its end.
    expect(chapter.end - chapter.start).toBeLessThan(chapter.start + 5);
    await s.at(Math.round((chapter.start + 5) * 1000));

    await s.playList(digest.id);
    await s.play(two);

    expect(refsOf(await s.queue())).toEqual([two, two]);
  });

  it('never counts a saved current with no known length as finished', async () => {
    const s = await server();
    const digest = await s.theDigest();
    db.prepare('UPDATE index_items SET duration = NULL WHERE upstream_id = ?').run(one.id);
    await s.add(one, 'now');
    await s.add(two, 'end');
    await s.at(10_000_000);

    await s.playList(digest.id);
    await s.play(two);

    expect(refsOf(await s.queue())).toEqual([two, two]);
  });

  it('refuses a digest play from a stale revision', async () => {
    const s = await server();
    const digest = await s.theDigest();

    expect(await s.call('POST', `/lists/${digest.id}/play`, { rev: 99 })).toEqual(
      refused(409, 'stale_revision'),
    );
  });

  it('keeps each device’s own saved queue', async () => {
    const s = await server();
    const digest = await s.theDigest();
    await s.add(two, 'now');
    await s.add(one, 'now', 'kara-phone');
    await s.playList(digest.id);
    await s.playList(digest.id, {}, 'kara-phone');

    await s.play(two);

    expect((await s.queue()).digest).toBeNull();
    expect(refsOf(await s.queue())).toEqual([two]);
    const phone = await s.queue('kara-phone');
    expect(phone.digest).toBe(digest.id);
    expect(s.stored('kara-phone').saved.map((q) => [q.owner, q.queue.current?.ref])).toEqual([
      [null, one],
    ]);
  });
});
