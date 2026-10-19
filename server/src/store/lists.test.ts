import { randomUUID } from 'node:crypto';
import type { MediaRef } from '@auralis/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.js';
import { createDevice } from './devices.js';
import {
  addListItem,
  createList,
  deleteList,
  ensureTheDigest,
  FixedList,
  getList,
  listLists,
  markPlayed,
  playedMarks,
  setListItems,
  updateList,
} from './lists.js';
import { openSession, saveSession, type SessionQueue, type StoredSession } from './listening.js';
import { upsertUser } from './users.js';

const show = (id: string): MediaRef => ({ source: 'abs', id });
const episode1: MediaRef = { source: 'abs', id: 'episode-1' };
const episode2: MediaRef = { source: 'abs', id: 'episode-2' };
const episode3: MediaRef = { source: 'abs', id: 'episode-3' };

const queueOf = (ref: MediaRef): SessionQueue => ({
  current: { itemId: randomUUID(), ref },
  position: { ms: 5_000, takenAt: 100 },
  user: [],
  context: null,
});

let db: Db;
beforeEach(() => {
  db = openDatabase(':memory:');
});
afterEach(() => db.close());

const person = (username = 'kara') => upsertUser(db, { username, role: 'member' }).id;

describe('The Digest', () => {
  it('is made once per person, oldest first, and comes before every other list', () => {
    const kara = person();
    const otto = person('otto');
    const playlist = createList(db, kara, { kind: 'playlist', name: 'Commute' }, 1000);

    const first = ensureTheDigest(db, kara, 2000);
    const again = ensureTheDigest(db, kara, 3000);

    expect(again).toEqual(first);
    expect(first).toMatchObject({
      kind: 'digest',
      name: 'The Digest',
      theDigest: true,
      order: 'oldest',
      items: [],
      createdAt: 2000,
    });
    expect(listLists(db, kara).map((l) => l.id)).toEqual([first.id, playlist.id]);
    expect(ensureTheDigest(db, otto).id).not.toBe(first.id);
    expect(listLists(db, otto)).toHaveLength(1);
  });

  it('lists lists made at one moment in the order they were made', () => {
    const kara = person();
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];

    for (const name of names) createList(db, kara, { kind: 'playlist', name }, 1000);

    expect(listLists(db, kara).map((l) => l.name)).toEqual(names);
  });

  it('cannot be renamed, given shows or deleted, but its order can change', () => {
    const kara = person();
    const digest = ensureTheDigest(db, kara, 1000);

    expect(() => updateList(db, kara, digest.id, { name: 'Mine' })).toThrow(FixedList);
    expect(() => setListItems(db, kara, digest.id, [show('show-1')])).toThrow(FixedList);
    expect(() => addListItem(db, kara, digest.id, show('show-1'))).toThrow(FixedList);
    expect(() => deleteList(db, kara, digest.id)).toThrow(FixedList);

    const turned = updateList(db, kara, digest.id, { order: 'newest' }, 2000);

    expect(turned).toMatchObject({
      name: 'The Digest',
      order: 'newest',
      items: [],
      updatedAt: 2000,
    });
    expect(getList(db, kara, digest.id)).toEqual(turned);
  });
});

describe('a list in the store', () => {
  it('keeps its entries in the order given, adds to the end, and reorders or removes whole', () => {
    const kara = person();
    const list = createList(db, kara, { kind: 'playlist', name: 'Commute' }, 1000);
    expect(list).toMatchObject({ kind: 'playlist', theDigest: false, order: null, items: [] });

    addListItem(db, kara, list.id, episode3, 1100);
    addListItem(db, kara, list.id, episode1, 1200);
    expect(getList(db, kara, list.id)!.items).toEqual([episode3, episode1]);

    const reordered = setListItems(db, kara, list.id, [episode1, episode2], 1300);

    expect(reordered).toMatchObject({ items: [episode1, episode2], updatedAt: 1300 });
    expect(getList(db, kara, list.id)).toEqual(reordered);
  });

  it('makes a custom digest from the shows it names, oldest first unless told, and renames it', () => {
    const kara = person();
    const digest = createList(
      db,
      kara,
      { kind: 'digest', name: 'Science', items: [show('show-2'), show('show-1')] },
      1000,
    );
    const newest = createList(db, kara, { kind: 'digest', name: 'News', order: 'newest' }, 1000);

    expect(digest).toMatchObject({ theDigest: false, order: 'oldest' });
    expect(digest.items).toEqual([show('show-2'), show('show-1')]);
    expect(newest.order).toBe('newest');
    expect(updateList(db, kara, digest.id, { name: 'Space' })!.name).toBe('Space');
  });

  it('is only ever its owner’s: another person cannot read, change or delete it', () => {
    const kara = person();
    const otto = person('otto');
    const list = createList(db, kara, { kind: 'listening', name: 'Summer' });

    expect(getList(db, otto, list.id)).toBeNull();
    expect(updateList(db, otto, list.id, { name: 'Mine' })).toBeNull();
    expect(setListItems(db, otto, list.id, [episode1])).toBeNull();
    expect(addListItem(db, otto, list.id, episode1)).toBeNull();
    expect(deleteList(db, otto, list.id)).toBe(false);
    expect(listLists(db, otto)).toEqual([]);
    expect(getList(db, kara, list.id)).toEqual(list);
  });

  it('goes, with its entries, when it is deleted, or when its owner is', () => {
    const kara = person();
    const otto = person('otto');
    const gone = createList(db, kara, { kind: 'playlist', name: 'Old', items: [episode1] });
    createList(db, kara, { kind: 'playlist', name: 'Kept', items: [episode2] });
    createList(db, otto, { kind: 'playlist', name: 'Otto’s', items: [episode3] });
    ensureTheDigest(db, kara);
    markPlayed(db, kara, episode1, 1000);
    markPlayed(db, otto, episode1, 1000);

    expect(deleteList(db, kara, gone.id)).toBe(true);
    expect(getList(db, kara, gone.id)).toBeNull();
    expect(deleteList(db, kara, gone.id)).toBe(false);

    db.prepare('DELETE FROM users WHERE id = ?').run(kara);

    const rows = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    expect(rows('lists')).toBe(1);
    expect(rows('list_items')).toBe(1);
    expect(rows('played_marks')).toBe(1);
    expect(listLists(db, otto).map((l) => l.name)).toEqual(['Otto’s']);
  });
});

describe('deleting a digest a device holds a queue for', () => {
  function devices() {
    const kara = person();
    const phone = createDevice(db, { userId: kara, kind: 'android', name: 'Phone' }).id;
    const laptop = createDevice(db, { userId: kara, kind: 'web', name: 'Laptop' }).id;
    const digest = createList(db, kara, { kind: 'digest', name: 'Science' });
    const write = (device: string, change: (s: StoredSession) => Partial<StoredSession>) => {
      const s = openSession(db, kara, device)!;
      return saveSession(db, kara, device, s.rev, { ...s, ...change(s) })!;
    };
    return { kara, phone, laptop, digest, write };
  }

  it('leaves the digest’s queue playing as your own, dropping the own queue it saved', () => {
    const { kara, phone, digest, write } = devices();
    const before = write(phone, (s) => ({
      spokenDigest: digest.id,
      queues: { ...s.queues, spoken: queueOf(episode2) },
      saved: [{ owner: null, queue: queueOf(episode1), autoplay: null, savedAt: 500 }],
    }));

    deleteList(db, kara, digest.id, 2000);

    const after = openSession(db, kara, phone)!;
    expect(after.spokenDigest).toBeNull();
    expect(after.saved).toEqual([]);
    expect(after.queues.spoken).toEqual(before.queues.spoken);
    expect(after.rev).toBe(before.rev + 1);
    expect(after.updatedAt).toBe(2000);
  });

  it('drops the digest’s saved queue on a device in your own queue, keeping everything else', () => {
    const { kara, phone, laptop, digest, write } = devices();
    const other = createList(db, kara, { kind: 'digest', name: 'News' });
    const before = write(laptop, () => ({
      saved: [
        { owner: digest.id, queue: queueOf(episode2), autoplay: null, savedAt: 500 },
        { owner: other.id, queue: queueOf(episode3), autoplay: null, savedAt: 600 },
      ],
    }));
    const untouched = write(phone, () => ({}));

    deleteList(db, kara, digest.id, 2000);

    const after = openSession(db, kara, laptop)!;
    expect(after.saved.map((q) => q.owner)).toEqual([other.id]);
    expect(after.rev).toBe(before.rev + 1);
    expect(openSession(db, kara, phone)).toEqual(untouched);
  });
});

describe('deleting a digest, for another person', () => {
  it('leaves their sessions alone, even one naming the digest', () => {
    const kara = person();
    const otto = person('otto');
    const digest = createList(db, kara, { kind: 'digest', name: 'Science' });
    const device = createDevice(db, { userId: otto, kind: 'web', name: 'Laptop' }).id;
    const s = openSession(db, otto, device)!;
    const theirs = saveSession(db, otto, device, s.rev, {
      ...s,
      saved: [{ owner: null, queue: queueOf(episode1), autoplay: null, savedAt: 500 }],
    })!;
    // Only a write past the store's checks can do this; deleting must not reach it regardless.
    db.prepare('UPDATE listening_sessions SET spoken_digest = ? WHERE device_id = ?').run(
      digest.id,
      device,
    );

    deleteList(db, kara, digest.id, 2000);

    const after = openSession(db, otto, device)!;
    expect(after.rev).toBe(theirs.rev);
    expect(after.saved).toEqual(theirs.saved);
  });
});

describe('played marks', () => {
  it('keep the newest time each episode was marked played, per person', () => {
    const kara = person();
    const otto = person('otto');

    markPlayed(db, kara, episode1, 2000);
    markPlayed(db, kara, episode1, 1000);
    markPlayed(db, kara, episode2, 3000);
    markPlayed(db, otto, episode3, 4000);

    expect(playedMarks(db, kara)).toEqual(
      new Map([
        ['abs:episode-1', 2000],
        ['abs:episode-2', 3000],
      ]),
    );
    expect(playedMarks(db, otto)).toEqual(new Map([['abs:episode-3', 4000]]));
  });
});
