/**
 * The hourly stubbing pass, on the test feed and the Podcasts library recorded on a throwaway
 * Audiobookshelf 2.37.2 (record-podcasts.ts `abs-stubs`): the test show, holding two stubs, and a
 * show whose feed is one of Auralis's own channel feeds.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsProvisioner, type HeldEpisode } from '../adapters/audiobookshelf/provision.js';
import { type Feed, type FeedEpisode, parseFeed } from '../adapters/feed/client.js';
import { type Recording, recordingSchema } from '../adapters/http/recording.js';
import { replayFetch } from '../adapters/http/replay.js';
import { episodeFilenames } from './filename.js';
import { isStub, type RangeAnswer, readStubState, writeStub } from './format.js';
import { type JobOptions, premiumDuplicates, runStubJob } from './job.js';

const ADAPTERS = fileURLToPath(new URL('../adapters/', import.meta.url));
const recording = (upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(ADAPTERS, upstream, 'recordings', `${call}.json`), 'utf8')),
  );
const feedText = (() => {
  const body = recording('feed', 'subscribe-feed').response.body;
  if (body === null || !('text' in body)) throw new Error('subscribe-feed: no text');
  return body.text;
})();
const range = (n: number): RangeAnswer => {
  const r = recording('feed', `stubs-range-${n}`);
  return {
    status: r.response.status,
    contentRange: r.response.headers['content-range'] ?? null,
    body: readFileSync(join(ADAPTERS, 'feed', 'recordings', `stubs-range-${n}.mp3`)),
  };
};
const absCalls = ['stubs-libraries', 'stubs-shows', 'stubs-episodes', 'stubs-scan'].map((c) =>
  recording('audiobookshelf', c),
);
const SHOW = 'bcb80cce-6c45-4a55-9a09-847b6f19ac35';
const CHANNEL_PREFIX = 'https://upstream.invalid/feeds/youtube/';

let media: string;
let control: string;
let showFolder: string;
let logs: string[];
let scans: string[];
let feedsRead: string[];

beforeEach(async () => {
  media = mkdtempSync(join(tmpdir(), 'auralis-stubs-job-'));
  control = join(media, 'control');
  showFolder = join(media, 'Podcasts', 'Not What You Thought You Knew');
  mkdirSync(join(media, 'Podcasts', 'Test Channel'), { recursive: true });
  logs = [];
  scans = [];
  feedsRead = [];
  // The folder as it was when the library was recorded: the two oldest episodes stubbed.
  const feed = parseFeed(feedText);
  const held = feed.episodes.slice(-2).reverse();
  for (const [n, episode] of held.entries()) {
    await writeStub({
      path: join(showFolder, episodeFilenames(episode.title, episode.enclosureUrl!)[0]!),
      url: episode.enclosureUrl!,
      declaredLength: episode.enclosureLength,
      rangeGet: async () => range(n + 1),
    });
  }
});

afterEach(() => rmSync(media, { recursive: true, force: true }));

function options(feed: (url: string) => Feed = () => parseFeed(feedText)): JobOptions {
  const provisioner = new AbsProvisioner({
    baseUrl: 'http://upstream.invalid',
    provisionKey: 'key',
    fetch: replayFetch(absCalls),
  });
  return {
    abs: {
      podcastShows: () => provisioner.podcastShows(),
      showEpisodes: (id) => provisioner.showEpisodes(id),
      scanItem: async (id) => {
        await provisioner.scanItem(id);
        scans.push(id);
      },
    },
    readFeed: async (url) => {
      feedsRead.push(url);
      return feed(url);
    },
    rangeGet: async () => range(1),
    absRoot: '/data',
    mediaRoot: media,
    channelFeedPrefix: CHANNEL_PREFIX,
    pauseMarker: join(control, 'pause-hydration'),
    log: (line) => logs.push(line),
    sleep: async () => {},
  };
}

describe('[M3.stubs/a] the hourly job stubs each subscribed show’s episodes', () => {
  it('[M3.stubs/a] writes a stub for each episode without a file, none for the channel, scans the show, and a second run does nothing', async () => {
    const episodes = parseFeed(feedText).episodes;
    const first = await runStubJob(options());
    expect(first.written).toBe(episodes.length - 2);
    expect(first.scanned).toEqual([SHOW]);
    expect(scans).toEqual([SHOW]);
    for (const e of episodes) {
      const file = join(showFolder, episodeFilenames(e.title, e.enclosureUrl!)[0]!);
      expect(isStub(file), e.title ?? '').toBe(true);
    }
    expect(readdirSync(join(media, 'Podcasts', 'Test Channel'))).toEqual([]);
    expect(feedsRead.every((url) => !url.startsWith(CHANNEL_PREFIX))).toBe(true);
    expect(readdirSync(control)).toEqual([]);

    const second = await runStubJob(options());
    expect(second).toMatchObject({ written: 0, adopted: 0, removed: 0, scanned: [] });
    expect(scans).toEqual([SHOW]);
  });

  it('[M3.stubs/a] never writes a stub beside a file the old stubgen named with a trailing space', async () => {
    const vectors = JSON.parse(
      readFileSync(new URL('./fixtures/filename-vectors.json', import.meta.url), 'utf8'),
    ) as { vectors: { title: string; oldStubgen?: string }[] };
    const long = vectors.vectors.find((v) => v.oldStubgen !== undefined)!.title;
    const feed = parseFeed(feedText);
    const episode: FeedEpisode = { ...feed.episodes[0]!, title: long };
    const [abs, old] = episodeFilenames(long, episode.enclosureUrl!);
    expect(old).toMatch(/ \.mp3$/);
    await writeStub({
      path: join(showFolder, old!),
      url: episode.enclosureUrl!,
      declaredLength: null,
      rangeGet: async () => range(1),
    });
    await runStubJob(options(() => ({ ...feed, episodes: [episode] })));
    expect(readdirSync(showFolder)).not.toContain(abs);
  });

  it('[M3.stubs/a] skips a teaser and removes a teaser still a stub', async () => {
    const feed = parseFeed(feedText);
    const oldest = feed.episodes.at(-1)!;
    const teaser = { ...feed.episodes[0]!, title: '[TEASER] Next week' };
    const renamed: FeedEpisode = { ...oldest, title: `(Teaser) ${oldest.title}` };
    // The stub already on disk carries the old title's name; a teaser stub under the new one goes.
    const stale = join(showFolder, episodeFilenames(renamed.title, renamed.enclosureUrl!)[0]!);
    await writeStub({
      path: stale,
      url: renamed.enclosureUrl!,
      declaredLength: null,
      rangeGet: async () => range(1),
    });
    const result = await runStubJob(options(() => ({ ...feed, episodes: [teaser, renamed] })));
    expect(result).toMatchObject({ written: 0, removed: 1, skippedTeaser: 2 });
    expect(readdirSync(showFolder)).not.toContain(
      episodeFilenames(teaser.title, teaser.enclosureUrl!)[0],
    );
    expect(readdirSync(showFolder)).not.toContain(stale.split('/').at(-1));
  });

  it('[M3.stubs/a] skips and logs an item whose title sanitizes to nothing', async () => {
    const feed = parseFeed(feedText);
    const result = await runStubJob(
      options(() => ({ ...feed, episodes: [{ ...feed.episodes[0]!, title: 'con' }] })),
    );
    expect(result).toMatchObject({ written: 0, skippedNoName: 1 });
    expect(logs.some((l) => l.includes('leaves no file name'))).toBe(true);
  });

  it('[M3.stubs/a] adopts a whole file with no stub attributes, keeping its times', async () => {
    const result = await runStubJob(options());
    expect(result.adopted).toBe(0);
    const feed = parseFeed(feedText);
    const newest = feed.episodes[0]!;
    const path = join(showFolder, episodeFilenames(newest.title, newest.enclosureUrl!)[0]!);
    rmSync(path);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, 'a download ABS made itself');
    const again = await runStubJob(options());
    expect(again).toMatchObject({ written: 0, adopted: 1, scanned: [SHOW] });
    expect(readStubState(path)).toMatchObject({ kind: 'hydrated', origUrl: newest.enclosureUrl });
  });

  it('[M3.stubs/a] a failed feed leaves the other shows running, and no log line holds a query', async () => {
    const feed = parseFeed(feedText);
    const result = await runStubJob(
      options(() => {
        throw new Error('GET https://www.patreon.com/rss/show?auth=secret-token answered 500');
      }),
    );
    expect(result).toMatchObject({ failed: 1, written: 0 });
    expect(logs.join('\n')).not.toMatch(/\?|secret-token/);
    const broken = { ...feed, episodes: [{ ...feed.episodes[0]!, title: 'Fresh' }] };
    const failing = await runStubJob({
      ...options(() => broken),
      rangeGet: async () => {
        throw new Error('GET https://cdn.invalid/a.mp3?token=secret-token refused');
      },
    });
    expect(failing.written).toBe(0);
    expect(logs.join('\n')).not.toMatch(/\?|secret-token/);
  });
});

describe('[M3.stubs/a] a Patreon feed’s reposts are not stubbed twice', () => {
  const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
  const item = (title: string, day: string, duration: number, length = 1): FeedEpisode => ({
    guid: null,
    title,
    description: null,
    enclosureUrl: `https://cdn.invalid/${title.length}.mp3`,
    enclosureLength: length,
    enclosureType: 'audio/mpeg',
    duration,
    publishedAt: at(day),
  });
  const held = (title: string, day: string, duration: number): HeldEpisode => ({
    title,
    pubDate: new Date(at(day)).toUTCString(),
    duration,
    filename: `${title}.mp3`,
  });

  it('[M3.stubs/a] an [AD-FREE] repost of a held episode is a duplicate; a 5-minute preview repeats nothing', () => {
    const repost = item('Roe v. Wade [AD-FREE]', '2025-01-02', 3600);
    const preview = item('Bonus Episode', '2025-01-03', 3600);
    const skip = premiumDuplicates(
      [repost, preview],
      [held('Roe v. Wade', '2025-01-01', 3599), held('Bonus Episode', '2025-01-03', 300)],
    );
    expect([...skip]).toEqual([repost]);
  });

  it('[M3.stubs/a] the same audio under another title, within a day and 2 s, is a duplicate', () => {
    const renamed = item('Something else entirely', '2025-01-02', 3601);
    expect(premiumDuplicates([renamed], [held('Original', '2025-01-01', 3600)]).has(renamed)).toBe(
      true,
    );
  });

  it('[M3.stubs/a] of two candidates on one day with one duration, only the larger stays', () => {
    const small = item('Premium one', '2025-02-01', 2000, 10);
    const large = item('Premium two', '2025-02-01', 2000, 20);
    expect([...premiumDuplicates([small, large], [])]).toEqual([small]);
  });
});
