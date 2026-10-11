import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { runRecord } from './record-cli.js';

const ABS = 'http://abs.invalid:13378';
const JF = 'http://jellyfin.invalid:8096';
const BOOK = '7b3fa64c-f00c-4de6-8cd5-15d301b91f4b';
const TRACK = 'c'.repeat(32);
const TICKS = 10_000_000;

interface Progress {
  id: string;
  libraryItemId: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
}
interface UserData {
  PlaybackPositionTicks: number;
  PlayCount: number;
  IsFavorite: boolean;
  Played: boolean;
  LastPlayedDate?: string;
}

interface FakeOptions {
  /** The ABS key's own user; `auralis` unless a test says otherwise. */
  absUser?: string;
  /** Progress the test user already had on the book. */
  priorProgress?: Progress;
  /** What ABS answers a user deleting their own listening session. */
  sessionDelete?: 200 | 403;
  /** A call that fails with a 500 the first time it is made, as `METHOD /path`. */
  failing?: string;
  /** Leaves the Jellyfin UserData post-back unapplied, as if Jellyfin ignored it. */
  ignoreUserDataPost?: boolean;
}

/**
 * A fake of both upstreams holding the test user's state: ABS progress, bookmarks, listening
 * sessions and stats; Jellyfin user data. Each answers as the recordings show: ABS a bare `OK` or
 * `Not Found`, and Jellyfin counts a music track played at its start and keeps no resume point.
 * It keeps each call with its body and authorization.
 */
function fakeUpstreams(options: FakeOptions = {}) {
  const asked: { call: string; body: unknown; authorization: string }[] = [];
  let progress: Progress | undefined = options.priorProgress;
  let bookmarks: { libraryItemId: string; time: number; title: string; createdAt: number }[] = [];
  const sessions = new Map<string, { open: boolean; listened: number }>();
  let failed = false;
  let userData: UserData = {
    PlaybackPositionTicks: 0,
    PlayCount: 0,
    IsFavorite: false,
    Played: false,
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const text = (body: string, status: number) =>
    new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const syncFrom = (body: { currentTime: number; timeListened: number; duration: number }) => {
    progress = {
      id: progress?.id ?? 'mp-1',
      libraryItemId: BOOK,
      currentTime: body.currentTime,
      duration: body.duration,
      progress: body.currentTime / body.duration,
      isFinished: false,
    };
  };

  const fetch: FetchLike = async (url, init) => {
    const { origin, pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    const call = `${method} ${pathname}`;
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const authorization = new Headers(init?.headers).get('authorization') ?? '';
    asked.push({ call, body, authorization });
    if (call === options.failing && !failed) {
      failed = true;
      return text('Internal Server Error', 500);
    }

    if (origin === new URL(ABS).origin) {
      if (pathname === '/status') return json({ serverVersion: '2.37.0' });
      if (pathname === '/api/me') {
        return json({
          id: 'u-auralis',
          username: options.absUser ?? 'auralis',
          token: 'abs-user-token-zzzz',
          mediaProgress: progress ? [progress] : [],
          bookmarks,
        });
      }
      if (pathname === '/api/me/listening-stats') {
        const total = [...sessions.values()].reduce((sum, s) => sum + s.listened, 0);
        return json({ totalTime: 100 + total, items: {}, days: {} });
      }
      if (pathname === `/api/me/progress/${BOOK}` && method === 'GET') {
        return progress ? json(progress) : text('Not Found', 404);
      }
      if (pathname === `/api/me/progress/${BOOK}` && method === 'PATCH') {
        progress = { ...(progress as Progress), ...(body as Partial<Progress>) };
        return text('OK', 200);
      }
      if (pathname.startsWith('/api/me/progress/') && method === 'DELETE') {
        if (progress?.id !== pathname.split('/')[4]) return text('Not Found', 404);
        progress = undefined;
        return text('OK', 200);
      }
      if (pathname === `/api/items/${BOOK}/play`) {
        sessions.set('play-p', { open: true, listened: 0 });
        return json({
          id: 'play-p',
          userId: 'u-auralis',
          libraryItemId: BOOK,
          duration: 167.5,
          playMethod: 0,
          currentTime: progress?.currentTime ?? 0,
          audioTracks: [{ contentUrl: `/api/items/${BOOK}/file/1`, mimeType: 'audio/mpeg' }],
        });
      }
      const session = /^\/api\/session\/([^/]+)\/(sync|close)$/.exec(pathname);
      if (session && method === 'POST') {
        const held = sessions.get(session[1] ?? '');
        if (!held?.open) return text('Not Found', 404);
        const sync = body as { currentTime: number; timeListened: number; duration: number };
        if (sync !== undefined) {
          syncFrom(sync);
          held.listened += sync.timeListened;
        }
        if (session[2] === 'close') held.open = false;
        return text('OK', 200);
      }
      if (pathname.startsWith('/api/sessions/') && method === 'DELETE') {
        if ((options.sessionDelete ?? 403) === 403) return text('Forbidden', 403);
        sessions.delete(pathname.split('/')[3] ?? '');
        return text('OK', 200);
      }
      if (pathname === `/api/me/item/${BOOK}/bookmark` && method === 'POST') {
        const made = {
          libraryItemId: BOOK,
          ...(body as { time: number; title: string }),
          createdAt: 1,
        };
        bookmarks = [...bookmarks, made];
        return json(made);
      }
      const mark = new RegExp(`^/api/me/item/${BOOK}/bookmark/(\\d+)$`).exec(pathname);
      if (mark && method === 'DELETE') {
        const time = Number(mark[1]);
        if (!bookmarks.some((b) => b.time === time)) return text('Not Found', 404);
        bookmarks = bookmarks.filter((b) => b.time !== time);
        return text('OK', 200);
      }
      return text('Not Found', 404);
    }

    if (pathname === '/System/Info/Public') return json({ Version: '10.11.11' });
    if (pathname === '/Users') {
      return json([
        { Id: 'u-other', Name: 'someone', Policy: { IsDisabled: false } },
        { Id: 'u-auralis', Name: 'auralis', Policy: { IsDisabled: false } },
      ]);
    }
    if (pathname === '/QuickConnect/Initiate') return json({ Secret: 'qc-secret', Code: '123' });
    if (pathname === '/QuickConnect/Authorize') return json(true);
    if (pathname === '/Users/AuthenticateWithQuickConnect') {
      return json({ AccessToken: 'person-token-0000', User: { Id: 'u-auralis' } });
    }
    if (pathname === `/UserItems/${TRACK}/UserData` && method === 'GET') {
      return json({ ...userData, ItemId: TRACK, Key: 'track-key' });
    }
    if (pathname === `/UserItems/${TRACK}/UserData` && method === 'POST') {
      if (options.ignoreUserDataPost !== true) {
        const { LastPlayedDate, ...rest } = body as UserData;
        userData = { ...userData, ...rest, ...(LastPlayedDate ? { LastPlayedDate } : {}) };
      }
      return json({ ...userData, ItemId: TRACK, Key: 'track-key' });
    }
    if (pathname === '/Sessions/Playing') {
      userData = {
        ...userData,
        PlayCount: userData.PlayCount + 1,
        Played: true,
        LastPlayedDate: '2026-10-11T16:00:42.2891977Z',
      };
      return new Response(null, { status: 204 });
    }
    if (pathname === '/Sessions/Playing/Progress') return new Response(null, { status: 204 });
    if (pathname === '/Sessions/Playing/Stopped') return new Response(null, { status: 204 });
    if (pathname === '/Sessions/Logout') return new Response(null, { status: 204 });
    return text('Not Found', 404);
  };
  return {
    fetch,
    asked,
    state: () => ({ progress, bookmarks, sessions: [...sessions.values()], userData }),
  };
}

function progressIo(fetch: FetchLike, argv?: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const slept: number[] = [];
  return {
    io: {
      argv: argv ?? [
        '--only',
        'progress',
        '--abs',
        ABS,
        '--jellyfin',
        JF,
        '--play-item',
        BOOK,
        '--jellyfin-item',
        TRACK,
        '--dry-run',
      ],
      stdin: 'ABS_API_KEY=test-abs-key-0000\nJELLYFIN_API_KEY=test-jellyfin-key-0000\n',
      fetch,
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
      sleep: async (ms: number) => {
        slept.push(ms);
      },
    },
    out,
    err,
    slept,
  };
}

const written = (out: string[]) =>
  out.filter((l) => l.startsWith('wrote ')).map((l) => l.replace(/^wrote /, ''));
const recorded = (out: string[], call: string) =>
  JSON.parse(
    readFileSync(
      written(out).find((w) => w.endsWith(`/${call}.json`))!,
      'utf8',
    ),
  ) as {
    request: { method: string; path: string; headers: Record<string, string>; body: unknown };
    response: { status: number; body: unknown };
  };

describe("record mode for M1.progress's calls", () => {
  it('records the play, a sync and a close, the progress they wrote, and a bookmark made, listed and deleted twice', async () => {
    const up = fakeUpstreams();
    const { io, out, err } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    expect(err).toEqual([]);
    expect(written(out).map((w) => w.split('/').slice(-3).join('/'))).toEqual([
      'audiobookshelf/recordings/progress-play.json',
      'audiobookshelf/recordings/progress-sync.json',
      'audiobookshelf/recordings/progress-close.json',
      'audiobookshelf/recordings/progress-read.json',
      'audiobookshelf/recordings/bookmark-create.json',
      'audiobookshelf/recordings/me.json',
      'audiobookshelf/recordings/bookmark-delete.json',
      'audiobookshelf/recordings/bookmark-delete-missing.json',
      'jellyfin/recordings/jf-playing.json',
      'jellyfin/recordings/jf-progress.json',
      'jellyfin/recordings/jf-stopped.json',
      'jellyfin/recordings/jf-userdata.json',
    ]);
    expect(recorded(out, 'bookmark-delete-missing').response.status).toBe(404);
    expect(recorded(out, 'progress-read').response.body).toMatchObject({
      json: { currentTime: 20 },
    });
  });

  it('reports wall-clock listening time it really waited: 15 s synced, then 5 s more at close', async () => {
    const up = fakeUpstreams();
    const { io, out, slept } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    expect(recorded(out, 'progress-sync').request.body).toEqual({
      json: { currentTime: 15, timeListened: 15, duration: 167.5 },
    });
    expect(recorded(out, 'progress-close').request.body).toEqual({
      json: { currentTime: 20, timeListened: 5, duration: 167.5 },
    });
    expect(slept).toEqual([15_000, 5_000, 15_000, 5_000]);
  });

  it("reports the track's start, progress at 15 s and stop at 20 s, in ticks, as the test user's own device", async () => {
    const up = fakeUpstreams();
    const { io, out } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    const bodies = ['jf-playing', 'jf-progress', 'jf-stopped'].map(
      (c) => (recorded(out, c).request.body as { json: Record<string, unknown> }).json,
    );
    const [playing, progress, stopped] = bodies;
    expect(playing).toMatchObject({ ItemId: TRACK, PositionTicks: 0, IsPaused: false });
    expect(progress).toMatchObject({
      ItemId: TRACK,
      PositionTicks: 15 * TICKS,
      IsPaused: false,
      PlayMethod: 'DirectPlay',
    });
    expect(stopped).toMatchObject({ ItemId: TRACK, PositionTicks: 20 * TICKS });
    const playSession = playing?.PlaySessionId;
    expect(playSession).toEqual(expect.any(String));
    expect(bodies.map((b) => b?.PlaySessionId)).toEqual([playSession, playSession, playSession]);
    for (const c of ['jf-playing', 'jf-progress', 'jf-stopped', 'jf-userdata']) {
      expect(recorded(out, c).request.headers.authorization).toContain(
        'DeviceId="auralis-recorder"',
      );
    }
    const reports = up.asked.filter((a) => a.call.startsWith('POST /Sessions/Playing'));
    for (const r of reports) expect(r.authorization).toContain('Token="person-token-0000"');
  });

  it("leaves the test user's progress, bookmarks and track as they were, and reads them back to prove it", async () => {
    const up = fakeUpstreams();
    const before = structuredClone(up.state());
    const { io, out } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    const after = up.state();
    expect(after.progress).toEqual(before.progress);
    expect(after.bookmarks).toEqual(before.bookmarks);
    expect(after.userData).toMatchObject({
      PlaybackPositionTicks: 0,
      PlayCount: 0,
      Played: false,
      IsFavorite: false,
    });
    expect(up.asked.map((a) => a.call)).toContain('DELETE /api/me/progress/mp-1');
    const lines = out.join('\n');
    expect(lines).toMatch(/^before .*audiobookshelf progress none/m);
    expect(lines).toMatch(/^after .*audiobookshelf progress none/m);
    expect(lines).toMatch(/^reverted: the read-back matches/m);
  });

  it('puts back progress the test user already had, rather than deleting it', async () => {
    const prior = {
      id: 'mp-0',
      libraryItemId: BOOK,
      currentTime: 60,
      duration: 167.5,
      progress: 60 / 167.5,
      isFinished: false,
    };
    const up = fakeUpstreams({ priorProgress: prior });
    const { io } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    expect(up.state().progress).toEqual(prior);
    expect(up.asked.map((a) => a.call)).toContain(`PATCH /api/me/progress/${BOOK}`);
    expect(up.asked.some((a) => a.call.startsWith('DELETE /api/me/progress/'))).toBe(false);
  });

  it('deletes the listening session when ABS lets the user, and says so when it does not', async () => {
    const allowed = fakeUpstreams({ sessionDelete: 200 });
    const run = progressIo(allowed.fetch);
    expect(await runRecord(run.io)).toBe(0);
    expect(allowed.state().sessions).toEqual([]);
    expect(run.out.join('\n')).toMatch(/listening session deleted/);

    const refused = fakeUpstreams({ sessionDelete: 403 });
    const kept = progressIo(refused.fetch);
    expect(await runRecord(kept.io)).toBe(0);
    expect(kept.out.join('\n')).toMatch(/listening session kept: 403/);
  });

  it('still reverts everything, and logs the minted token out last, when a call fails midway', async () => {
    const up = fakeUpstreams({ failing: `POST /api/me/item/${BOOK}/bookmark` });
    const { io } = progressIo(up.fetch);
    await expect(runRecord(io)).rejects.toThrow(/bookmark/);
    expect(up.state().progress).toBeUndefined();
    expect(up.state().sessions.every((s) => !s.open)).toBe(true);
    expect(up.asked.at(-1)?.call).toBe('POST /Sessions/Logout');
  });

  it('closes an open session, deletes a bookmark left behind and stops the track when the run fails before it does', async () => {
    const abs = fakeUpstreams({ failing: `GET /api/me` });
    await expect(runRecord(progressIo(abs.fetch).io)).rejects.toThrow();
    expect(abs.asked.some((a) => a.call.includes('/play'))).toBe(false);

    const sync = fakeUpstreams({ failing: 'POST /api/session/play-p/sync' });
    await expect(runRecord(progressIo(sync.fetch).io)).rejects.toThrow(/sync/);
    expect(sync.asked.map((a) => a.call)).toContain('POST /api/session/play-p/close');

    const del = fakeUpstreams({ failing: `DELETE /api/me/item/${BOOK}/bookmark/30` });
    await expect(runRecord(progressIo(del.fetch).io)).rejects.toThrow();
    expect(del.state().bookmarks).toEqual([]);

    const jf = fakeUpstreams({ failing: 'POST /Sessions/Playing/Progress' });
    await expect(runRecord(progressIo(jf.fetch).io)).rejects.toThrow(/Progress/);
    expect(jf.asked.map((a) => a.call)).toContain('POST /Sessions/Playing/Stopped');
    expect(jf.state().userData).toMatchObject({ PlayCount: 0, PlaybackPositionTicks: 0 });
  });

  it("names the track's last-played date and the listening total as known leftovers when the revert could not put them back", async () => {
    const up = fakeUpstreams({ sessionDelete: 403 });
    const { io, out } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    const leftovers = out.filter((l) => l.startsWith('known leftover: '));
    expect(leftovers).toEqual([
      'known leftover: audiobookshelf listening total 100 s, now 120 s',
      'known leftover: jellyfin last played never, now 2026-10-11T16:00:42.2891977Z',
    ]);
    expect(out.join('\n')).toMatch(/^reverted: the read-back matches/m);
  });

  it('names no listening leftover when the listening session could be deleted', async () => {
    const up = fakeUpstreams({ sessionDelete: 200 });
    const { io, out } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    expect(out.filter((l) => l.startsWith('known leftover: '))).toEqual([
      'known leftover: jellyfin last played never, now 2026-10-11T16:00:42.2891977Z',
    ]);
  });

  it('fails when the read-back differs from before', async () => {
    const up = fakeUpstreams({ ignoreUserDataPost: true });
    const { io, err } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(1);
    expect(err.join('\n')).toMatch(/not as it was/);
  });

  it('writes nothing for anyone but the test user: another key is refused before any write', async () => {
    const up = fakeUpstreams({ absUser: 'someone' });
    const { io } = progressIo(up.fetch);
    await expect(runRecord(io)).rejects.toThrow(/auralis/);
    expect(up.asked.every((a) => a.call.startsWith('GET '))).toBe(true);
  });

  it('needs the book and the track to record', async () => {
    const up = fakeUpstreams();
    const { io, err } = progressIo(up.fetch, [
      '--only',
      'progress',
      '--abs',
      ABS,
      '--jellyfin',
      JF,
      '--dry-run',
    ]);
    expect(await runRecord(io)).toBe(2);
    expect(err.join('\n')).toContain('--play-item');
    expect(err.join('\n')).toContain('--jellyfin-item');
    expect(up.asked).toEqual([]);
  });

  it("scrubs the user's own token out of the recorded GET /api/me", async () => {
    const up = fakeUpstreams();
    const { io, out } = progressIo(up.fetch);
    expect(await runRecord(io)).toBe(0);
    expect(JSON.stringify(recorded(out, 'me'))).not.toContain('abs-user-token-zzzz');
  });
});
