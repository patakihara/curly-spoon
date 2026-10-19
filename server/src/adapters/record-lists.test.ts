import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { runRecord } from './record-cli.js';

const ABS = 'http://abs.invalid:13378';
const SHOW = 'show-1';
const EPISODE = 'ep-old';

interface Progress {
  id: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
}

/** Audiobookshelf holding the test user's progress, if any, on one episode of one show. */
function fakeAbs(start: Progress | undefined, username = 'auralis') {
  const asked: string[] = [];
  const bodies: unknown[] = [];
  let progress = start && { ...start };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const row = () => ({ libraryItemId: SHOW, episodeId: EPISODE, ...progress });
  const fetch: FetchLike = async (input, init) => {
    const u = new URL(input);
    const method = init?.method ?? 'GET';
    const p = u.pathname;
    asked.push(`${method} ${p}`);
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body));
    if (p === '/status') return json({ serverVersion: '2.37.1' });
    if (p === '/api/me') return json({ id: 'u', username, mediaProgress: [], bookmarks: [] });
    if (p === `/api/items/${SHOW}`) {
      return json({
        id: SHOW,
        libraryId: 'pods',
        updatedAt: 1,
        mediaType: 'podcast',
        media: {
          metadata: { title: 'A Show', genres: [] },
          episodes: [{ id: EPISODE, title: 'One', updatedAt: 1 }],
        },
      });
    }
    if (p === `/api/me/progress/${SHOW}/${EPISODE}`) {
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body)) as Partial<Progress>;
        progress = {
          ...(progress ?? { id: 'made', currentTime: 0, duration: 0, progress: 0 }),
          isFinished: false,
          ...patch,
          ...(patch.isFinished === true ? { progress: 1 } : {}),
        };
        return new Response('OK', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }
      return progress ? json(row()) : new Response('Not Found', { status: 404 });
    }
    if (method === 'DELETE' && progress && p === `/api/me/progress/${progress.id}`) {
      progress = undefined;
      return new Response('OK');
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked, bodies, progress: () => progress };
}

async function run(fake: ReturnType<typeof fakeAbs>, argv?: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRecord({
    argv: argv ?? [
      ...['--only', 'lists', '--abs', ABS, '--play-item', SHOW, '--episode', EPISODE],
      '--dry-run',
    ],
    stdin: 'ABS_API_KEY=abskey\n',
    fetch: fake.fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  });
  return { code, out, err };
}

describe("record mode for M2.lists' played mark", () => {
  it('records marking the episode finished, sent as the test user with only isFinished', async () => {
    const fake = fakeAbs(undefined);
    const { code, out, err } = await run(fake);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
    expect(files.map((f) => f.split('/').slice(-3).join('/'))).toEqual([
      'audiobookshelf/recordings/episode-mark-finished.json',
    ]);
    const recording = recordingSchema.parse(JSON.parse(readFileSync(files[0]!, 'utf8')));
    expect(recording.request).toMatchObject({
      method: 'PATCH',
      path: `/api/me/progress/${SHOW}/${EPISODE}`,
      body: { json: { isFinished: true } },
    });
    expect(recording.response).toMatchObject({ status: 200, body: { text: 'OK' } });
    expect(JSON.stringify(recording)).not.toContain('abskey');
  });

  it('deletes the progress the mark made when there was none, and reads it back gone', async () => {
    const fake = fakeAbs(undefined);
    const { out } = await run(fake);
    expect(fake.asked).toContain('DELETE /api/me/progress/made');
    expect(fake.progress()).toBeUndefined();
    expect(out).toContain("reverted: the episode's progress reads back as before");
  });

  it('writes the old progress back when the episode had some', async () => {
    const before = { id: 'p1', currentTime: 42, duration: 600, progress: 0.07, isFinished: false };
    const fake = fakeAbs(before);
    const { code, out } = await run(fake);
    expect(code).toBe(0);
    expect(fake.bodies.at(-1)).toEqual({
      currentTime: 42,
      duration: 600,
      progress: 0.07,
      isFinished: false,
    });
    expect(fake.progress()).toEqual(before);
    expect(out).toContain("reverted: the episode's progress reads back as before");
  });

  it('reads only the show it is given, and never lists a library', async () => {
    const fake = fakeAbs(undefined);
    await run(fake);
    expect(fake.asked.filter((a) => a.includes('/libraries'))).toEqual([]);
    expect(fake.asked).toContain(`GET /api/items/${SHOW}`);
  });

  it("refuses a key that is not the test user's, before marking anything", async () => {
    const fake = fakeAbs(undefined, 'someone');
    const { code, err } = await run(fake).catch((e: unknown) => ({
      code: 1,
      err: [String(e)],
      out: [],
    }));
    expect(code).not.toBe(0);
    expect(err.join('\n')).toMatch(/not auralis/);
    expect(fake.asked.some((a) => a.startsWith('PATCH'))).toBe(false);
  });

  it('refuses to run without a show and an episode', async () => {
    const fake = fakeAbs(undefined);
    const { code, err } = await run(fake, ['--only', 'lists', '--abs', ABS]);
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/--play-item, --episode/);
  });
});
