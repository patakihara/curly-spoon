import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { runRecord } from './record-cli.js';

const BASE = 'http://upstream.invalid:13378';

/** A fake Audiobookshelf whose play answer is `play`; it keeps every method and path asked. */
function fakeAbs(play: unknown) {
  const asked: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    const { pathname } = new URL(url);
    const method = init?.method ?? 'GET';
    asked.push(`${method} ${pathname}`);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (pathname === '/status') return json({ serverVersion: '2.36.1' });
    if (pathname === '/api/libraries') {
      return json({ libraries: [{ id: 'lib1', name: 'Books', mediaType: 'book' }] });
    }
    if (pathname === '/api/libraries/lib1/items') return json({ results: [{ id: 'li1' }] });
    if (pathname === '/api/items/li1') return json({ id: 'li1', mediaType: 'book', media: {} });
    if (pathname === '/api/items/li1/play') return json(play);
    if (pathname.startsWith('/api/session/')) return new Response('OK', { status: 200 });
    return new Response('not found', { status: 404 });
  };
  return { fetch, asked };
}

function io(fetch: FetchLike) {
  const err: string[] = [];
  return {
    io: {
      argv: ['--abs', BASE, '--only', 'abs', '--dry-run'],
      stdin: 'ABS_API_KEY=test-abs-key-0000\n',
      fetch,
      out: () => undefined,
      err: (line: string) => err.push(line),
    },
    err,
  };
}

describe('record mode against Audiobookshelf', () => {
  it('closes the playback session even when the play answer fails its schema', async () => {
    const abs = fakeAbs({ id: 'play_7', playMethod: 'not a number' });
    const { io: recordIo } = io(abs.fetch);
    await expect(runRecord(recordIo)).rejects.toThrow(/POST \/api\/items\/li1\/play/);
    expect(abs.asked).toContain('POST /api/session/play_7/close');
  });

  it('closes the session it recorded, exactly once, when everything parses', async () => {
    const abs = fakeAbs({
      id: 'play_8',
      playMethod: 0,
      audioTracks: [{ contentUrl: '/api/items/li1/file/1', mimeType: 'audio/mp4' }],
    });
    const { io: recordIo, err } = io(abs.fetch);
    const code = await runRecord(recordIo);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([
      'POST /api/session/play_8/close',
    ]);
  });

  it('closes nothing when the play answer carries no session id', async () => {
    const abs = fakeAbs({ error: 'no id here' });
    const { io: recordIo } = io(abs.fetch);
    await expect(runRecord(recordIo)).rejects.toThrow();
    expect(abs.asked.filter((a) => a.endsWith('/close'))).toEqual([]);
  });
});
