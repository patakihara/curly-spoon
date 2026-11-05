import type { RequestRef } from '@auralis/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { standInRelease } from '../adapters/http/standIn.js';
import { openDatabase, type Db } from './connection.js';
import {
  createRequest,
  deleteRequest,
  getRequest,
  peopleOn,
  requestsOf,
  saveRequest,
  workingRequests,
} from './requests.js';
import { upsertUser } from './users.js';

const book: RequestRef = {
  medium: 'book',
  target: { title: 'Powers', creator: 'Ursula K. Le Guin', ids: { asin: 'B0036S4B76' } },
};
const album: RequestRef = {
  medium: 'album',
  target: {
    title: 'Fragments',
    creator: 'Fleeting Verses',
    ids: { mbid: '3f8a5e7c-1b2d-4e6f-9a0b-c1d2e3f4a5b6' },
  },
};

let db: Db;
let ana: string;
let ben: string;
beforeEach(() => {
  db = openDatabase(':memory:');
  ana = upsertUser(db, { username: 'ana', role: 'member' }).id;
  ben = upsertUser(db, { username: 'ben', role: 'member' }).id;
});

describe('the requests store', () => {
  it('[M3.books] keeps when a download last moved until a change says otherwise', () => {
    const { request } = createRequest(db, ana, book, 1);
    const queued = { state: { status: 'queued' as const } };
    saveRequest(db, request.id, { ...queued, progressAt: 5 }, 2);
    expect(getRequest(db, request.id)?.progressAt).toBe(5);
    saveRequest(db, request.id, queued, 3);
    expect(getRequest(db, request.id)?.progressAt).toBe(5);
  });

  it('keeps a new request as requested, with its target, and the person who made it', () => {
    const { request, joined } = createRequest(db, ana, book, 1_000);
    expect(joined).toBe(false);
    expect(request).toEqual({
      id: expect.any(String),
      medium: 'book',
      target: book.target,
      state: { status: 'requested' },
      release: null,
      candidates: [],
      handle: null,
      stepKey: null,
      result: null,
      progressAt: null,
      heldSince: null,
      version: 0,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    expect(getRequest(db, request.id)).toEqual(request);
    expect(peopleOn(db, request.id)).toEqual([ana]);
  });

  it('saves where a request stands with its release, candidates, download and result, and reads them back', () => {
    const { request } = createRequest(db, ana, album, 1_000);
    const candidates = [standInRelease('a'), standInRelease('b')];
    saveRequest(db, request.id, { state: { status: 'needsChoice' }, candidates }, 2_000);
    expect(getRequest(db, request.id)).toMatchObject({
      state: { status: 'needsChoice' },
      candidates,
    });
    saveRequest(
      db,
      request.id,
      {
        state: { status: 'downloading', progress: 0.4 },
        release: candidates[1],
        handle: { hash: 'abc' },
      },
      3_000,
    );
    saveRequest(
      db,
      request.id,
      {
        state: { status: 'failed', failedStep: 'importing', reason: 'importFailed' },
        result: { source: 'jellyfin', id: 'a'.repeat(32) },
      },
      4_000,
    );
    expect(getRequest(db, request.id)).toEqual({
      ...request,
      state: { status: 'failed', failedStep: 'importing', reason: 'importFailed' },
      release: candidates[1],
      candidates,
      handle: { hash: 'abc' },
      result: { source: 'jellyfin', id: 'a'.repeat(32) },
      version: 3,
      updatedAt: 4_000,
    });
  });

  it('saves nothing on a deleted row, and brings nothing back', () => {
    const { request } = createRequest(db, ana, book, 1_000);
    deleteRequest(db, request.id);
    expect(saveRequest(db, request.id, { state: { status: 'searching' } }, 2_000)).toBe(false);
    expect(getRequest(db, request.id)).toBeNull();
  });

  it('saves over a version it read, and refuses once the row has moved past it', () => {
    const { request } = createRequest(db, ana, book, 1_000);
    const searching = { state: { status: 'searching' } } as const;
    expect(saveRequest(db, request.id, searching, 2_000, request.version)).toBe(true);
    expect(
      saveRequest(db, request.id, { state: { status: 'requested' } }, 3_000, request.version),
    ).toBe(false);
    expect(getRequest(db, request.id)).toMatchObject({
      state: { status: 'searching' },
      version: request.version + 1,
      updatedAt: 2_000,
    });
  });

  it('lets go of its catalogue ids when deleted, so asking again makes a new request', () => {
    const { request } = createRequest(db, ana, book, 1_000);
    deleteRequest(db, request.id);
    const keys = db.prepare('SELECT COUNT(*) AS n FROM request_keys').get() as { n: number };
    expect(keys.n).toBe(0);
    const again = createRequest(db, ana, book, 2_000);
    expect(again.joined).toBe(false);
    expect(again.request.id).not.toBe(request.id);
  });

  it('replaces a live request that cannot be read: it is deleted and everyone on it moves over', () => {
    const { request } = createRequest(db, ana, book, 1_000);
    db.prepare('UPDATE requests SET handle = ? WHERE id = ?').run('{', request.id);
    const logged: Record<string, unknown>[] = [];

    const made = createRequest(db, ben, book, 2_000, { error: (details) => logged.push(details) });

    expect(made.joined).toBe(false);
    expect(made.request.id).not.toBe(request.id);
    expect(db.prepare('SELECT id FROM requests').all()).toEqual([{ id: made.request.id }]);
    expect(peopleOn(db, made.request.id).sort()).toEqual([ana, ben].sort());
    expect(logged).toEqual([expect.objectContaining({ request: request.id })]);
    expect(createRequest(db, ana, book, 3_000).request.id).toBe(made.request.id);
  });

  it('joins a readable live request over one that cannot be read, and clears that one out', () => {
    const asin = createRequest(db, ana, book, 1_000).request;
    const isbnOnly = { ...book, target: { ...book.target, ids: { isbn: '9780141439600' } } };
    const isbn = createRequest(db, ben, isbnOnly, 2_000).request;
    db.prepare('UPDATE requests SET handle = ? WHERE id = ?').run('{', asin.id);
    const both = {
      ...book,
      target: { ...book.target, ids: { asin: book.target.ids.asin!, isbn: '9780141439600' } },
    };

    const made = createRequest(db, ben, both, 3_000);

    expect(made).toMatchObject({ joined: true, request: { id: isbn.id } });
    expect(getRequest(db, asin.id)).toBeNull();
    expect(peopleOn(db, isbn.id).sort()).toEqual([ana, ben].sort());
  });

  it('joins a second person’s request for the same thing to the first, never a second download', () => {
    const first = createRequest(db, ana, book, 1_000).request;
    const same = {
      ...book,
      target: { ...book.target, title: 'Powers (Annals of the Western Shore)' },
    };
    const second = createRequest(db, ben, same, 2_000);
    expect(second).toEqual({ request: first, joined: true });
    expect(peopleOn(db, first.id).sort()).toEqual([ana, ben].sort());
    expect(requestsOf(db, ben).map((r) => r.id)).toEqual([first.id]);
    expect(createRequest(db, ana, book, 3_000)).toEqual({ request: first, joined: true });
    expect(peopleOn(db, first.id)).toHaveLength(2);
  });

  it('makes a new request for something already in the library, and for the same id in another medium', () => {
    const first = createRequest(db, ana, book, 1_000).request;
    saveRequest(
      db,
      first.id,
      { state: { status: 'inLibrary' }, result: { source: 'abs', id: 'li-1' } },
      2_000,
    );
    expect(createRequest(db, ben, book, 3_000).joined).toBe(false);
    expect(createRequest(db, ben, album, 3_000).joined).toBe(false);
  });

  it('lists only a person’s own requests, and the working ones for the job, leaving out failed and finished', () => {
    const a = createRequest(db, ana, book, 1_000).request;
    const b = createRequest(db, ben, album, 2_000).request;
    expect(requestsOf(db, ana).map((r) => r.id)).toEqual([a.id]);
    expect(workingRequests(db).map((r) => r.id)).toEqual([a.id, b.id]);
    saveRequest(
      db,
      a.id,
      { state: { status: 'failed', failedStep: 'searching', reason: 'noRelease' } },
      3_000,
    );
    saveRequest(
      db,
      b.id,
      { state: { status: 'inLibrary' }, result: { source: 'jellyfin', id: 'b'.repeat(32) } },
      3_000,
    );
    expect(workingRequests(db)).toEqual([]);
  });

  it('deletes a cancelled request, and a person’s requests with them, keeping one another still holds', () => {
    const shared = createRequest(db, ana, book, 1_000).request;
    createRequest(db, ben, book, 1_000);
    const own = createRequest(db, ana, album, 1_000).request;
    db.prepare('DELETE FROM users WHERE id = ?').run(ana);
    expect(getRequest(db, own.id)).toBeNull();
    expect(peopleOn(db, shared.id)).toEqual([ben]);
    deleteRequest(db, shared.id);
    expect(getRequest(db, shared.id)).toBeNull();
    expect(requestsOf(db, ben)).toEqual([]);
  });

  it('refuses a status outside the vocabulary, a failure without its step and reason, and progress off a download', () => {
    const { request } = createRequest(db, ana, book, 1_000);
    const set = (sql: string) => () =>
      db.prepare(`UPDATE requests SET ${sql} WHERE id = ?`).run(request.id);
    expect(set("status = 'approved'")).toThrow(/CHECK/);
    expect(set("status = 'failed'")).toThrow(/CHECK/);
    expect(set("status = 'failed', failed_step = 'searching'")).toThrow(/CHECK/);
    expect(set("status = 'failed', failed_step = 'inLibrary', reason = 'noRelease'")).toThrow(
      /CHECK/,
    );
    expect(set("status = 'failed', failed_step = 'searching', reason = 'oops'")).toThrow(/CHECK/);
    expect(set('progress = 0.5')).toThrow(/CHECK/);
    expect(set("status = 'downloading', progress = 1.5")).toThrow(/CHECK/);
    expect(set("status = 'inLibrary'")).toThrow(/CHECK/);
    expect(set("medium = 'video'")).toThrow(/CHECK/);
  });

  it('joins a request for the same MusicBrainz release however its id is cased', () => {
    const first = createRequest(db, ana, album, 1_000).request;
    const mbid = '3F8A5E7C-1B2D-4E6F-9A0B-C1D2E3F4A5B6';
    const upper = { ...album, target: { ...album.target, ids: { mbid } } };
    expect(createRequest(db, ben, upper, 2_000).request.id).toBe(first.id);
  });

  it('joins a request for the same feed however its host is cased', () => {
    const feed = (feedUrl: string): RequestRef => ({
      medium: 'podcast',
      target: { title: 'A Show', creator: null, ids: { feedUrl } },
    });
    const first = createRequest(db, ana, feed('https://feeds.example.com/show'), 1_000).request;
    const upper = feed('https://FEEDS.example.com/show');
    expect(createRequest(db, ben, upper, 2_000).request.id).toBe(first.id);
  });

  it('joins a request that shares any catalogue id with the live one, never a second download', () => {
    const named = (ids: RequestRef['target']['ids']): RequestRef => ({
      medium: 'book',
      target: { title: 'Powers', creator: null, ids },
    });
    const asin = 'B0036S4B76';
    const isbn = '9780547237633';
    const both = createRequest(db, ana, named({ asin, isbn }), 1_000).request;
    expect(createRequest(db, ben, named({ isbn }), 2_000).request.id).toBe(both.id);

    const otherIsbn = '9780151014880';
    const onlyIsbn = createRequest(db, ana, named({ isbn: otherIsbn }), 3_000).request;
    const wider = named({ asin: 'B000000001', isbn: otherIsbn });
    expect(createRequest(db, ben, wider, 4_000).request.id).toBe(onlyIsbn.id);
  });

  it('never lets one request it cannot read hide the others from the job', () => {
    const bad = createRequest(db, ana, book, 1_000).request;
    const good = createRequest(db, ben, album, 2_000).request;
    const release = { ...standInRelease('one'), id: 'not/an/id' };
    try {
      saveRequest(db, bad.id, { state: { status: 'queued' }, release }, 3_000);
    } catch {
      // Refusing the release at the write is as good as leaving it out of the read.
    }
    expect(workingRequests(db).map((r) => r.id)).toContain(good.id);
    expect(getRequest(db, bad.id)?.state).toEqual({ status: 'requested' });
  });

  it('leaves a row it cannot read out of the lists and logs it, naming no part of its content', () => {
    const bad = createRequest(db, ana, book, 1_000).request;
    const good = createRequest(db, ana, album, 2_000).request;
    db.prepare('UPDATE requests SET release = ? WHERE id = ?').run('{"secret": ', bad.id);
    const logged: Record<string, unknown>[] = [];
    const log = { error: (details: Record<string, unknown>) => logged.push(details) };

    expect(workingRequests(db, log).map((r) => r.id)).toEqual([good.id]);
    expect(requestsOf(db, ana, log).map((r) => r.id)).toEqual([good.id]);
    expect(logged).toHaveLength(2);
    expect(logged[0]).toMatchObject({ request: bad.id });
    expect(JSON.stringify(logged)).not.toContain('secret');
  });

  it('refuses to save a status or a failed step off the request’s medium’s route', () => {
    const podcast = createRequest(
      db,
      ana,
      {
        medium: 'podcast',
        target: { title: 'A Show', creator: null, ids: { feedUrl: 'https://example.com/feed' } },
      },
      1_000,
    ).request;
    expect(() => saveRequest(db, podcast.id, { state: { status: 'queued' } }, 2_000)).toThrow();
    expect(() =>
      saveRequest(
        db,
        podcast.id,
        { state: { status: 'failed', failedStep: 'downloading', reason: 'downloadFailed' } },
        2_000,
      ),
    ).toThrow();
    expect(getRequest(db, podcast.id)?.state).toEqual({ status: 'requested' });
  });

  it('frees every id of a request once it is in the library, and takes on the ids a joiner adds', () => {
    const first = createRequest(db, ana, book, 1_000).request;
    const isbn = '9780547237633';
    const wider = { ...book, target: { ...book.target, ids: { asin: 'B0036S4B76', isbn } } };
    expect(createRequest(db, ben, wider, 2_000).request.id).toBe(first.id);
    const byIsbn = { ...book, target: { ...book.target, ids: { isbn } } };
    expect(createRequest(db, ana, byIsbn, 3_000).request.id).toBe(first.id);
    saveRequest(
      db,
      first.id,
      { state: { status: 'inLibrary' }, result: { source: 'abs', id: 'li-1' } },
      4_000,
    );
    const again = createRequest(db, ben, byIsbn, 5_000);
    expect(again.joined).toBe(false);
    expect(again.request.id).not.toBe(first.id);
  });
});
