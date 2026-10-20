import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { runRecord } from './record-cli.js';

const ABS = 'http://abs.invalid:13378';
const SHOW = 'show-1';
const EPISODE = 'ep-old';
const LATER = 'ep-later';
const UNCONFIRMED = /not as it was before the run: do not commit/;

interface Progress {
  id: string;
  currentTime: number;
  duration: number;
  progress: number;
  isFinished: boolean;
}

/** How the fake Audiobookshelf goes wrong, if it does. */
interface Faults {
  /** The PATCH that marks finished takes effect, then answers 500. */
  markFails?: boolean;
  /** The mark is stored, but the episode never reads back as finished. */
  finishReadsFalse?: boolean;
  /** DELETE answers OK, but the progress stays. */
  deleteIgnored?: boolean;
  /** DELETE answers 500 and changes nothing. */
  deleteFails?: boolean;
}

/** Audiobookshelf holding the test user's progress, if any, on the episodes of one show. */
function fakeAbs(start: Progress | undefined, username = 'auralis', faults: Faults = {}) {
  const asked: string[] = [];
  const bodies: unknown[] = [];
  const progress = new Map<string, Progress>(start ? [[EPISODE, { ...start }]] : []);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const text = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
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
          episodes: [EPISODE, LATER].map((id) => ({ id, title: id, updatedAt: 1 })),
        },
      });
    }
    const episode = [EPISODE, LATER].find((e) => p === `/api/me/progress/${SHOW}/${e}`);
    if (episode !== undefined) {
      const had = progress.get(episode);
      if (method === 'PATCH') {
        const patch = JSON.parse(String(init?.body)) as Partial<Progress>;
        progress.set(episode, {
          ...(had ?? { id: `made-${episode}`, currentTime: 0, duration: 0, progress: 0 }),
          isFinished: false,
          ...patch,
          ...(patch.isFinished === true ? { progress: 1 } : {}),
        });
        return patch.isFinished === true && faults.markFails ? text('Boom', 500) : text('OK');
      }
      if (!had) return text('Not Found', 404);
      const read = { libraryItemId: SHOW, episodeId: episode, ...had };
      return json(faults.finishReadsFalse ? { ...read, isFinished: false } : read);
    }
    const held = [...progress].find(([, v]) => p === `/api/me/progress/${v.id}`);
    if (method === 'DELETE' && held) {
      if (faults.deleteFails) return text('Boom', 500);
      if (!faults.deleteIgnored) progress.delete(held[0]);
      return text('OK');
    }
    return text('Not Found', 404);
  };
  return { fetch, asked, bodies, progress: (e = EPISODE) => progress.get(e) };
}

async function run(fake: ReturnType<typeof fakeAbs>, argv?: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRecord({
    argv: argv ?? [
      ...['--only', 'lists', '--abs', ABS, '--play-item', SHOW, '--episodes', EPISODE],
      '--dry-run',
    ],
    stdin: 'ABS_API_KEY=abskey\n',
    fetch: fake.fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  });
  return { code, out, err };
}

/** Runs record mode and returns the error it fails with. */
async function failure(fake: ReturnType<typeof fakeAbs>): Promise<string> {
  const error = await run(fake).then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(Error);
  return (error as Error).message;
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
    expect(fake.asked).toContain(`DELETE /api/me/progress/made-${EPISODE}`);
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

  it('refuses to run without a show and its episodes', async () => {
    const fake = fakeAbs(undefined);
    const { code, err } = await run(fake, ['--only', 'lists', '--abs', ABS]);
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/--play-item, --episodes/);
  });

  it('records each episode it is given under its own name, each mark put back', async () => {
    const fake = fakeAbs(undefined);
    const { code, out } = await run(fake, [
      ...[
        '--only',
        'lists',
        '--abs',
        ABS,
        '--play-item',
        SHOW,
        '--episodes',
        `${EPISODE},${LATER}`,
      ],
      '--dry-run',
    ]);
    expect(code).toBe(0);
    const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
    expect(files.map((f) => f.split('/').at(-1))).toEqual([
      'episode-mark-finished.json',
      'episode-mark-finished-2.json',
    ]);
    const second = recordingSchema.parse(JSON.parse(readFileSync(files[1]!, 'utf8')));
    expect(second.request.path).toBe(`/api/me/progress/${SHOW}/${LATER}`);
    expect(fake.progress(EPISODE)).toBeUndefined();
    expect(fake.progress(LATER)).toBeUndefined();
  });

  it('puts the progress back when the mark itself fails', async () => {
    const fake = fakeAbs(undefined, 'auralis', { markFails: true });
    const message = await failure(fake);
    expect(message).toMatch(/answered 500/);
    expect(fake.asked).toContain(`DELETE /api/me/progress/made-${EPISODE}`);
    expect(fake.progress()).toBeUndefined();
    expect(message).not.toMatch(UNCONFIRMED);
  });

  it('fails, and puts the progress back, when the episode does not read back as finished', async () => {
    const before = { id: 'p1', currentTime: 42, duration: 600, progress: 0.07, isFinished: false };
    const fake = fakeAbs(before, 'auralis', { finishReadsFalse: true });
    const message = await failure(fake);
    expect(message).toMatch(/does not read back as finished/);
    expect(fake.progress()).toEqual(before);
  });

  it('exits 1 with "do not commit" when the progress does not read back as before', async () => {
    const fake = fakeAbs(undefined, 'auralis', { deleteIgnored: true });
    const { code, out, err } = await run(fake);
    expect(code).toBe(1);
    expect(err.join('\n')).toMatch(UNCONFIRMED);
    expect(out).not.toContain("reverted: the episode's progress reads back as before");
  });

  it('reports both errors, and "do not commit", when the mark and then its undo fail', async () => {
    const fake = fakeAbs(undefined, 'auralis', { markFails: true, deleteFails: true });
    const message = await failure(fake);
    expect(message).toMatch(/PATCH .*answered 500/);
    expect(message).toMatch(/DELETE .*answered 500/);
    expect(message).toMatch(UNCONFIRMED);
  });
});
