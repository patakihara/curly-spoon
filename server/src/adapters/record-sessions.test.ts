import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { runRecord } from './record-cli.js';
import { FEED_TRIMMED, oldestEnclosure, trimFeed } from './record-sessions.js';

const FEED = `<?xml version="1.0" encoding="utf-8"?>
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:omny="https://omny.fm/rss-extensions" version="2.0">
  <channel>
    <omny:programId>p</omny:programId>
    <title>A Show</title>
    <itunes:owner><itunes:email>someone@example.com</itunes:email></itunes:owner>
    <image><url>https://img.example.com/a.jpg</url><title>Art</title></image>
    <itunes:type>serial</itunes:type>
    <item>
      <title>Part Two</title>
      <description><![CDATA[<a href="https://sponsor.example.com">Sponsor</a>]]></description>
      <itunes:episodeType>full</itunes:episodeType>
      <guid isPermaLink="false">g2</guid>
      <pubDate>Wed, 06 Sep 2023 04:00:00 +0000</pubDate>
      <enclosure url="https://podtrac.com/e2.mp3?a=1&amp;b=2" length="2" type="audio/mpeg" />
    </item>
    <item>
      <title>Part One</title>
      <guid isPermaLink="false">g1</guid>
      <pubDate>Tue, 05 Sep 2023 04:00:00 +0000</pubDate>
      <enclosure url="https://podtrac.com/e1.mp3?a=1&amp;b=2" length="1" type="audio/mpeg" />
    </item>
  </channel>
</rss>`;

describe('trimming a feed for its recording', () => {
  it('keeps the channel title and itunes:type, and each item in order with only what ordering needs', () => {
    const trimmed = trimFeed(FEED);
    expect(trimmed).toContain(`<!-- ${FEED_TRIMMED} -->`);
    expect(trimmed).toContain('<title>A Show</title>');
    expect(trimmed).toContain('<itunes:type>serial</itunes:type>');
    expect(trimmed.indexOf('Part Two')).toBeLessThan(trimmed.indexOf('Part One'));
    expect(trimmed).toContain('<guid isPermaLink="false">g1</guid>');
    expect(trimmed).toContain('<itunes:episodeType>full</itunes:episodeType>');
    expect(trimmed).toContain('<enclosure url="https://podtrac.com/e1.mp3?a=1&amp;b=2"');
    for (const gone of ['sponsor', 'someone@', 'img.example', 'omny', '<title>Art</title>']) {
      expect(trimmed).not.toContain(gone);
    }
  });

  it('refuses anything that is not an RSS 2.0 feed', () => {
    expect(() => trimFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toThrow(/RSS 2.0/);
  });

  it("finds the enclosure of the feed's oldest item, whatever the order", () => {
    expect(oldestEnclosure(FEED)).toBe('https://podtrac.com/e1.mp3?a=1&b=2');
  });
});

const ABS = 'http://abs.invalid:13378';
const JF = 'http://jellyfin.invalid:8096';
const FEED_ORIGIN = 'https://feeds.invalid';
const SHOW1 = 'show-1';
const EP_OLD = 'ep-old';

/** Both upstreams and the feed host, holding the test user's progress on one episode. */
function fakeUpstreams() {
  const asked: string[] = [];
  let progress: { id: string; isFinished: boolean } | undefined;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const book = (id: string, sequence: string) => ({
    id,
    libraryId: 'lib',
    updatedAt: 1,
    mediaType: 'book',
    media: {
      metadata: {
        title: id,
        authors: [],
        narrators: [],
        series: [{ id: 'series', name: 'Series', sequence }],
        genres: [],
      },
      audioFiles: [],
    },
  });
  const show = (id: string) => ({
    id,
    libraryId: 'pods',
    updatedAt: 1,
    mediaType: 'podcast',
    media: {
      metadata: { title: id, genres: [], feedUrl: `${FEED_ORIGIN}/${id}.rss` },
      episodes: [
        {
          id: 'ep-new',
          title: 'Part Two',
          updatedAt: 1,
          enclosure: { url: 'https://podtrac.com/e2.mp3?a=1&b=2' },
        },
        {
          id: EP_OLD,
          title: 'Part One',
          updatedAt: 1,
          enclosure: { url: 'https://podtrac.com/e1.mp3?a=1&b=2' },
        },
      ],
    },
  });
  const progressRow = () => ({
    id: 'prog',
    libraryItemId: SHOW1,
    episodeId: EP_OLD,
    duration: 0,
    progress: 1,
    currentTime: 0,
    isFinished: progress?.isFinished ?? false,
  });
  const fetch: FetchLike = async (input, init) => {
    const u = new URL(input);
    const method = init?.method ?? 'GET';
    asked.push(`${method} ${u.origin === FEED_ORIGIN ? 'feed ' : ''}${u.pathname}`);
    const p = u.pathname;
    if (u.origin === FEED_ORIGIN) {
      return new Response(FEED, { headers: { 'content-type': 'application/xml' } });
    }
    if (u.origin === ABS) {
      if (p === '/status') return json({ serverVersion: '2.36.1' });
      if (p === '/api/me') {
        return json({
          id: 'u',
          username: 'auralis',
          mediaProgress: progress ? [progressRow()] : [],
          bookmarks: [],
        });
      }
      if (p.startsWith('/api/items/book-')) {
        return json(book(p.split('/')[3]!, p.endsWith('1') ? '1' : '2'));
      }
      if (p.startsWith('/api/items/show-')) return json(show(p.split('/')[3]!));
      if (p === `/api/me/progress/${SHOW1}/${EP_OLD}`) {
        if (method === 'PATCH') {
          progress = { id: 'prog', isFinished: true };
          return new Response('OK');
        }
        return progress ? json(progressRow()) : new Response('Not Found', { status: 404 });
      }
      if (p === '/api/me/progress/prog' && method === 'DELETE') {
        progress = undefined;
        return new Response('OK');
      }
    }
    if (u.origin === JF) {
      if (p === '/System/Info/Public') return json({ Version: '10.11.0' });
      if (p === '/Users')
        return json([{ Id: 'jfu', Name: 'auralis', Policy: { IsAdministrator: false } }]);
      if (p === '/QuickConnect/Initiate') return json({ Secret: 's', Code: '123456' });
      if (p === '/QuickConnect/Authorize') return json(true);
      if (p === '/Users/AuthenticateWithQuickConnect') {
        return json({ AccessToken: 'minted', User: { Id: 'jfu' } });
      }
      if (p === '/Items/track/InstantMix') {
        return json({ Items: [{ Id: 'mix-1', Type: 'Audio', AlbumId: 'a' }], TotalRecordCount: 1 });
      }
      if (p === '/Sessions/Logout') return new Response(null, { status: 204 });
    }
    return new Response('Not Found', { status: 404 });
  };
  return { fetch, asked, finished: () => progress };
}

async function run() {
  const fake = fakeUpstreams();
  const out: string[] = [];
  const err: string[] = [];
  const argv = [
    ...['--only', 'sessions', '--abs', ABS, '--jellyfin', JF, '--jellyfin-item', 'track'],
    ...['--books', 'book-1,book-2', '--shows', `${SHOW1},show-2`, '--dry-run'],
  ];
  const code = await runRecord({
    argv,
    stdin: 'ABS_API_KEY=abskey\nJELLYFIN_API_KEY=jfkey\n',
    fetch: fake.fetch,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
  });
  return { code, out, err, ...fake };
}

describe("record mode for M1.sessions' reads", () => {
  it('records two series books, two trimmed feeds, the finished episode read back, and Instant Mix', async () => {
    const { code, out, err } = await run();
    expect(err).toEqual([]);
    expect(code).toBe(0);
    const files = out.filter((l) => l.startsWith('wrote ')).map((l) => l.slice(6));
    expect(files.map((f) => f.split('/').slice(-3).join('/'))).toEqual([
      'audiobookshelf/recordings/series-book-1.json',
      'audiobookshelf/recordings/series-book-2.json',
      'feed/recordings/show-1-feed.json',
      'feed/recordings/show-2-feed.json',
      'audiobookshelf/recordings/me-finished.json',
      'jellyfin/recordings/jf-instant-mix.json',
    ]);
    const feed = recordingSchema.parse(JSON.parse(readFileSync(files[2]!, 'utf8')));
    expect(feed.response.body).toEqual({ text: trimFeed(FEED) });
    const me = recordingSchema.parse(JSON.parse(readFileSync(files[4]!, 'utf8')));
    expect(JSON.stringify(me.response.body)).toContain('"isFinished":true');
  });

  it("marks the feed's oldest episode finished, then deletes the mark and reads it back gone", async () => {
    const { asked, finished, out } = await run();
    expect(asked).toContain(`PATCH /api/me/progress/${SHOW1}/${EP_OLD}`);
    expect(asked).toContain('DELETE /api/me/progress/prog');
    expect(finished()).toBeUndefined();
    expect(out).toContain("reverted: the episode's progress reads back as before");
  });

  it('logs out the Jellyfin token it minted for the test user', async () => {
    const { asked } = await run();
    expect(asked.at(-1)).toBe('POST /Sessions/Logout');
  });

  it('refuses to run without two books and two shows', async () => {
    const err: string[] = [];
    const code = await runRecord({
      argv: ['--only', 'sessions', '--abs', ABS, '--jellyfin', JF, '--jellyfin-item', 't'],
      stdin: 'ABS_API_KEY=a\nJELLYFIN_API_KEY=b\n',
      fetch: async () => new Response(null),
      out: () => undefined,
      err: (l) => err.push(l),
    });
    expect(code).toBe(2);
    expect(err.join('\n')).toMatch(/--books \(two ids\), --shows \(two ids\)/);
  });
});
