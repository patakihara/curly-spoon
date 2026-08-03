import { describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { upsertUser } from './usersRepo.js';
import {
  createRequest,
  deleteRequest,
  getRequest,
  listRequests,
  updateRequest,
} from './requestsRepo.js';
import type { Release } from '../requests/types.js';

function makeUser(db: ReturnType<typeof openDatabase>, upstreamUserId = 'abs-user-1') {
  return upsertUser(db, { username: 'kara', upstreamUserId });
}

function fullRelease(): Release {
  return {
    guid: 'guid-1',
    indexerId: 'audiobookbay',
    sourceName: 'AudioBook Bay',
    title: 'Dune [M4B]',
    sizeBytes: 512_000_000,
    seeders: 12,
    leechers: 1,
    publishedAt: 1_700_000_000_000,
    downloadUrl: null,
    magnetUri: 'magnet:?xt=urn:btih:abc123',
    categories: ['Audiobooks'],
    format: 'm4b',
  };
}

describe('requestsRepo', () => {
  it('round-trips every field, including a full release', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const release = fullRelease();

    const created = createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      author: 'Frank Herbert',
      status: 'searching',
      release,
    });

    expect(created).toMatchObject({
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      author: 'Frank Herbert',
      status: 'searching',
      statusDetail: null,
      release,
      indexerId: null,
      clientId: null,
      downloadHandle: null,
      progress: 0,
    });
    expect(created.createdAt).toBeTypeOf('number');
    expect(created.updatedAt).toBeTypeOf('number');

    expect(getRequest(db, 'req-1')).toEqual(created);
  });

  it('defaults author and release to null when omitted', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);

    const created = createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });

    expect(created.author).toBeNull();
    expect(created.release).toBeNull();
  });

  it('returns null from getRequest for a missing id', () => {
    const db = openDatabase(':memory:');
    expect(getRequest(db, 'does-not-exist')).toBeNull();
  });

  it('lists requests newest-first, tie-broken by id for a stable order', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const now = 1_700_000_000_000;
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run('req-b', user.id, 'Book B', 'pending', now, now);
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run('req-a', user.id, 'Book A', 'pending', now, now);
    db.prepare(
      `INSERT INTO requests (id, user_id, title, status, progress, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    ).run('req-c', user.id, 'Book C', 'pending', now - 1000, now - 1000);

    const ids = listRequests(db).map((r) => r.id);
    // req-a and req-b share created_at; id order breaks the tie. req-c is strictly older.
    expect(ids).toEqual(['req-a', 'req-b', 'req-c']);
  });

  it('filters by status', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, { id: 'req-1', userId: user.id, title: 'A', status: 'pending' });
    createRequest(db, { id: 'req-2', userId: user.id, title: 'B', status: 'completed' });

    expect(listRequests(db, { status: 'completed' }).map((r) => r.id)).toEqual(['req-2']);
  });

  it('filters by userId', () => {
    const db = openDatabase(':memory:');
    const userA = makeUser(db, 'abs-user-a');
    const userB = makeUser(db, 'abs-user-b');
    createRequest(db, { id: 'req-1', userId: userA.id, title: 'A', status: 'pending' });
    createRequest(db, { id: 'req-2', userId: userB.id, title: 'B', status: 'pending' });

    expect(listRequests(db, { userId: userB.id }).map((r) => r.id)).toEqual(['req-2']);
  });

  it('filters by both status and userId together', () => {
    const db = openDatabase(':memory:');
    const userA = makeUser(db, 'abs-user-a');
    const userB = makeUser(db, 'abs-user-b');
    createRequest(db, { id: 'req-1', userId: userA.id, title: 'A', status: 'pending' });
    createRequest(db, { id: 'req-2', userId: userA.id, title: 'B', status: 'completed' });
    createRequest(db, { id: 'req-3', userId: userB.id, title: 'C', status: 'completed' });

    expect(listRequests(db, { status: 'completed', userId: userA.id }).map((r) => r.id)).toEqual([
      'req-2',
    ]);
  });

  it('writes only the patched keys and leaves the rest alone', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      author: 'Frank Herbert',
      status: 'pending',
    });

    const updated = updateRequest(db, 'req-1', { status: 'approved' });

    expect(updated?.status).toBe('approved');
    expect(updated?.title).toBe('Dune');
    expect(updated?.author).toBe('Frank Herbert');
  });

  it('bumps updatedAt even for an empty patch', async () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    const created = createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    const updated = updateRequest(db, 'req-1', {});

    expect(updated?.updatedAt).toBeGreaterThan(created.updatedAt);
  });

  it('leaves a field alone when the patch carries it as explicit undefined', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
    });
    updateRequest(db, 'req-1', { statusDetail: 'queued behind another request' });

    // A patch built by spread (`{ ...changes, statusDetail: cond ? x : undefined }`) can
    // carry a key whose value is `undefined` without the caller intending to touch it.
    // better-sqlite3 silently binds `undefined` as `NULL`, so treating "key present" as
    // "write it" would erase statusDetail here — this pins that it does not.
    const updated = updateRequest(db, 'req-1', { statusDetail: undefined, status: 'approved' });

    expect(updated?.status).toBe('approved');
    expect(updated?.statusDetail).toBe('queued behind another request');
  });

  it('returns null from updateRequest for a missing id', () => {
    const db = openDatabase(':memory:');
    expect(updateRequest(db, 'does-not-exist', { status: 'approved' })).toBeNull();
  });

  it('keeps a request readable when its stored release will not parse', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
      release: fullRelease(),
    });
    db.prepare('UPDATE requests SET release_json = ? WHERE id = ?').run('not json', 'req-1');

    expect(() => getRequest(db, 'req-1')).not.toThrow();
    expect(getRequest(db, 'req-1')?.release).toBeNull();
  });

  it('keeps a request readable when its stored release parses to a non-object', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, {
      id: 'req-1',
      userId: user.id,
      title: 'Dune',
      status: 'pending',
      release: fullRelease(),
    });
    db.prepare('UPDATE requests SET release_json = ? WHERE id = ?').run('"just a string"', 'req-1');

    expect(getRequest(db, 'req-1')?.release).toBeNull();
  });

  it('removes the row on delete', () => {
    const db = openDatabase(':memory:');
    const user = makeUser(db);
    createRequest(db, { id: 'req-1', userId: user.id, title: 'Dune', status: 'pending' });

    deleteRequest(db, 'req-1');

    expect(getRequest(db, 'req-1')).toBeNull();
  });
});
