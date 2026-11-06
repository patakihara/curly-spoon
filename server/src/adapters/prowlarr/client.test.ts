import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { StepUnavailable } from '../../requests/steps.js';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { PROWLARR_SEARCH_LIMIT_MS, ProwlarrClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorded = (call: string): Recording =>
  recordingSchema.parse(JSON.parse(readFileSync(join(here, 'recordings', `${call}.json`), 'utf8')));

const search = recorded('search-jekyll');
const others = recorded('search-jekyll-others');
const redirect = recorded('download-redirect');
const unauthorized = recorded('unauthorized');

const queryOf = (r: Recording) => r.request.query.query as string;
const KEY = '<token>';
const client = (fetch: FetchLike, apiKey = KEY) =>
  new ProwlarrClient({ baseUrl: 'http://upstream.invalid', apiKey, fetch });
const replayed = (...recordings: Recording[]) => client(replayFetch(recordings));

describe('[M3.books] searching Prowlarr', () => {
  it('[M3.books] skips a malformed row and logs it, never its contents, and keeps the rest', async () => {
    const good = {
      title: 'A Book',
      protocol: 'torrent',
      guid: 'MAGNET:?XT=urn:BTIH:' + 'a'.repeat(40),
    };
    const bad = { title: 7, protocol: 'torrent', downloadUrl: 'http://x.invalid/?apikey=sekrit' };
    const logged: unknown[] = [];
    const rows = await new ProwlarrClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: KEY,
      fetch: () => Promise.resolve(Response.json([bad, good, 'not a row'])),
      log: { error: (details) => logged.push(details) },
    }).search('a book');
    expect(rows.map((row) => row.title)).toEqual(['A Book']);
    expect(rows[0]?.details.magnet).toBe(good.guid);
    expect(logged).toEqual([
      { row: 0, fields: ['title'] },
      { row: 2, fields: [''] },
    ]);
    expect(JSON.stringify(logged)).not.toContain('sekrit');
  });

  it('[M3.books] reads a row that has no info hash and no magnet, by its link alone', async () => {
    const rows = await replayed(search).search(queryOf(search));
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(row.source).toBe('AudioBook Bay');
      expect(row.details.infoHash).toBeUndefined();
      expect(row.details.magnet).toBeUndefined();
      expect(row.details.link).toMatch(/^\/\d+\/download\?/);
      expect(row.infoUrl).toMatch(/^http:\/\/upstream\.invalid\/abss\//);
    }
  });

  it('[M3.books] reads a magnet from a guid and a hash where the indexer gives them', async () => {
    const rows = await replayed(others).search(queryOf(others));
    const magnet = rows.find((row) => row.details.magnet !== undefined);
    expect(magnet?.details.magnet).toMatch(/^magnet:\?xt=urn:btih:/);
    expect(magnet?.details.infoHash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('[M3.books] asks for audiobooks only, by its key in a header', async () => {
    const asked: { url: URL; init: RequestInit | undefined }[] = [];
    const replay = replayFetch([search]);
    await client(async (url, init) => {
      asked.push({ url: new URL(url), init });
      return replay(url, init);
    }).search(queryOf(search));
    expect(asked[0]?.url.searchParams.get('categories')).toBe('3030');
    expect(asked[0]?.url.searchParams.get('type')).toBe('search');
    expect(asked[0]?.url.searchParams.has('apikey')).toBe(false);
    expect(new Headers(asked[0]?.init?.headers).get('x-api-key')).toBe(KEY);
  });

  it("[M3.books] keeps Prowlarr's key out of every parsed release", async () => {
    const answer: FetchLike = async () =>
      new Response(
        JSON.stringify([
          {
            title: 'A Book',
            indexer: 'An Indexer',
            protocol: 'torrent',
            downloadUrl: 'http://localhost:9696/2/download?apikey=the-real-key&link=abc&file=A',
            magnetUrl: 'http://localhost:9696/2/download?APIKEY=the-real-key&link=abc',
            guid: 'http://localhost:9696/2/download?apikey=the-real-key',
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const rows = await client(answer, 'the-real-key').search('a book');
    expect(JSON.stringify(rows)).not.toContain('the-real-key');
    expect(JSON.stringify(rows).toLowerCase()).not.toContain('apikey');
    expect(rows[0]?.details.link).toBe('/2/download?link=abc');
  });

  it('[M3.books] drops a row nothing could be fetched from, and a usenet one', async () => {
    const answer: FetchLike = async () =>
      new Response(
        JSON.stringify([
          { title: 'Nothing to fetch', protocol: 'torrent', guid: 'http://a.invalid/page' },
          { title: 'Usenet', protocol: 'usenet', downloadUrl: 'http://localhost/1/download?x=1' },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    expect(await client(answer).search('a book')).toEqual([]);
  });

  it('[M3.books] waits for slow indexers for less than a step may take', () => {
    expect(PROWLARR_SEARCH_LIMIT_MS).toBeLessThan(120_000);
  });
});

describe("[M3.books] resolving a release through Prowlarr's link", () => {
  const link = () => {
    const url = new URL(`http://upstream.invalid${redirect.request.path}`);
    url.searchParams.set('link', redirect.request.query.link as string);
    return url.pathname + url.search;
  };

  it('[M3.books] asks the link at its own address with the key put back, following no redirect', async () => {
    const asked: { url: URL; init: RequestInit | undefined }[] = [];
    const replay = replayFetch([redirect]);
    const found = await client(async (url, init) => {
      asked.push({ url: new URL(url), init });
      return replay(url, init);
    }).resolve({ link: link() });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.url.origin).toBe('http://upstream.invalid');
    expect(asked[0]?.url.searchParams.get('apikey')).toBe(KEY);
    expect(asked[0]?.init?.redirect).toBe('manual');
    expect(found.kind).toBe('magnet');
    expect(found.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('[M3.books] uses a magnet it already holds, asking nothing', async () => {
    const hash = 'aabbccddeeff00112233445566778899aabbccdd';
    const nobody: FetchLike = () => Promise.reject(new Error('nothing should be asked'));
    const found = await client(nobody).resolve({ magnet: `magnet:?xt=urn:btih:${hash}` });
    expect(found).toEqual({ kind: 'magnet', magnet: `magnet:?xt=urn:btih:${hash}`, hash });
  });

  it('[M3.books] takes a 200 as torrent bytes, and hashes them', async () => {
    // No indexer gave bytes when this was recorded: every row answered with a magnet.
    const torrent = Buffer.from('d4:infod4:name4:bookee');
    const bytes: FetchLike = async () => new Response(torrent, { status: 200 });
    const found = await client(bytes).resolve({ link: '/2/download?link=abc' });
    const hash = createHash('sha1').update('d4:name4:booke').digest('hex');
    expect(found).toMatchObject({ kind: 'torrent', hash });
    expect(found.kind === 'torrent' && Buffer.from(found.bytes).equals(torrent)).toBe(true);
  });

  it('[M3.books] refuses an answer that is no torrent, and a redirect that is no magnet', async () => {
    const page: FetchLike = async () => new Response('<html>', { status: 200 });
    await expect(client(page).resolve({ link: '/2/d?x=1' })).rejects.toBeInstanceOf(AdapterError);
    const away: FetchLike = async () =>
      new Response(null, { status: 302, headers: { location: 'http://elsewhere.invalid/x' } });
    await expect(client(away).resolve({ link: '/2/d?x=1' })).rejects.toBeInstanceOf(AdapterError);
  });

  it('[M3.books] never names the link or the key when it fails', async () => {
    const down: FetchLike = () => Promise.reject(new Error('connect ECONNREFUSED'));
    const failure = await client(down, 'the-real-key')
      .resolve({ link: '/2/download?link=secret-link' })
      .catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(StepUnavailable);
    expect(String(failure)).not.toMatch(/the-real-key|secret-link/);
  });
});

describe('[M3.books] an unreachable Prowlarr holds the request; a refusal does not', () => {
  const refused: FetchLike = () => Promise.reject(new Error('connect ECONNREFUSED'));
  const broken: FetchLike = async () => new Response('down', { status: 503 });
  const calls = {
    search: (c: ProwlarrClient) => c.search('a book'),
    resolve: (c: ProwlarrClient) => c.resolve({ link: '/2/download?link=abc' }),
  };

  it.each(Object.entries(calls))(
    '[M3.books] %s throws StepUnavailable on a refused connection and a 5xx',
    async (_name, call) => {
      await expect(call(client(refused))).rejects.toBeInstanceOf(StepUnavailable);
      await expect(call(client(broken))).rejects.toBeInstanceOf(StepUnavailable);
    },
  );

  it('[M3.books] search throws StepUnavailable when its own limit runs out', async () => {
    const hung: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const short = new ProwlarrClient({
      baseUrl: 'http://upstream.invalid',
      apiKey: KEY,
      fetch: hung,
      timeoutMs: 5,
    });
    await expect(short.search('a book')).rejects.toBeInstanceOf(StepUnavailable);
  });

  it('[M3.books] a recorded 401 fails as it is, not held', async () => {
    const failure = await client(replayFetch([unauthorized]))
      .search(queryOf(unauthorized))
      .catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure).not.toBeInstanceOf(StepUnavailable);
    expect((failure as AdapterError).status).toBe(401);
  });
});
