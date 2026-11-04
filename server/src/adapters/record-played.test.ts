import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { runRecord } from './record-cli.js';
import { PLAYED_PAGE } from './record-played.js';

const JF = 'http://jellyfin.invalid:8096';
const TRACK = 'track-1';

/** Jellyfin holding `auralis`'s played tracks, and which calls it was asked. */
function fakeJellyfin(start: string[], username = 'auralis') {
  const played = new Set(start);
  const asked: string[] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  const fetch: FetchLike = async (input, init) => {
    const u = new URL(input);
    const method = init?.method ?? 'GET';
    const p = u.pathname;
    asked.push(`${method} ${p}`);
    if (p === '/System/Info/Public') return json({ Version: '10.11.11' });
    if (p === '/Users') {
      return json([{ Id: 'jfu', Name: username, Policy: { IsAdministrator: false } }]);
    }
    if (p === '/QuickConnect/Initiate') return json({ Secret: 's', Code: '123456' });
    if (p === '/QuickConnect/Authorize') return json(true);
    if (p === '/Users/AuthenticateWithQuickConnect') {
      return json({ AccessToken: 'minted', User: { Id: 'jfu' } });
    }
    if (p === '/Sessions/Logout') return new Response(null, { status: 204 });
    if (p === '/Items') {
      const ids = [...played].slice(0, Number(u.searchParams.get('Limit')));
      return json({
        Items: ids.map((Id) => ({ Id, Name: Id, Type: 'Audio', AlbumId: `album-of-${Id}` })),
        TotalRecordCount: played.size,
      });
    }
    if (p === `/UserPlayedItems/${TRACK}`) {
      if (method === 'POST') played.add(TRACK);
      if (method === 'DELETE') played.delete(TRACK);
      return json({ Played: played.has(TRACK) });
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked, played };
}

async function run(fake: ReturnType<typeof fakeJellyfin>, ...more: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runRecord({
    argv: ['--only', 'played', '--jellyfin', JF, '--dry-run', ...more],
    stdin: 'JELLYFIN_API_KEY=jfkey\n',
    fetch: fake.fetch,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  }).catch((error: unknown) => error);
  const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
  return { code, err, files };
}

const read = (file: string) => recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));

describe("record mode for M3.requests' played tracks", () => {
  it('records one small page of played tracks as the test user, marking nothing', async () => {
    const fake = fakeJellyfin(['a', 'b', 'c', 'd', 'e']);
    const { code, err, files } = await run(fake, '--jellyfin-item', TRACK);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(files.map((f) => f.split('/').slice(-3).join('/'))).toEqual([
      'jellyfin/recordings/jf-played-tracks.json',
    ]);
    const { request, response } = read(files[0]!);
    expect(request.query.Limit).toBe(String(PLAYED_PAGE));
    expect(request.query.Filters).toBe('IsPlayed');
    expect(response.body).toMatchObject({ json: { TotalRecordCount: 5 } });
    expect(fake.asked.filter((a) => a.includes('UserPlayedItems'))).toEqual([]);
    expect(fake.asked.at(-1)).toBe('POST /Sessions/Logout');
  });

  it('marks the given track only when the test user has played nothing, then undoes it', async () => {
    const fake = fakeJellyfin([]);
    const { code, err, files } = await run(fake, '--jellyfin-item', TRACK);
    expect(err).toEqual([]);
    expect(code).toBe(0);
    expect(read(files[0]!).response.body).toMatchObject({ json: { TotalRecordCount: 1 } });
    expect(fake.asked.filter((a) => a.includes('UserPlayedItems'))).toEqual([
      `POST /UserPlayedItems/${TRACK}`,
      `DELETE /UserPlayedItems/${TRACK}`,
    ]);
    expect(fake.played.size).toBe(0);
    expect(fake.asked.at(-1)).toBe('POST /Sessions/Logout');
  });

  it('stops, having marked nothing, when nothing is played and no track is given', async () => {
    const fake = fakeJellyfin([]);
    const { code, files } = await run(fake);
    expect(code).toBeInstanceOf(Error);
    expect(files).toEqual([]);
    expect(fake.asked.at(-1)).toBe('POST /Sessions/Logout');
  });

  it('refuses a key whose Jellyfin has no test user, minting nothing', async () => {
    const fake = fakeJellyfin(['a'], 'someone-else');
    const { code } = await run(fake);
    expect(code).toBeInstanceOf(Error);
    expect(fake.asked).not.toContain('POST /QuickConnect/Initiate');
  });
});
