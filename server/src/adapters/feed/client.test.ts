import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { FEED_MAX_BYTES, parseFeed, readFeed } from './client.js';

const ADAPTERS = fileURLToPath(new URL('../', import.meta.url));

function recording(upstream: string, call: string): Recording {
  const file = join(ADAPTERS, upstream, 'recordings', `${call}.json`);
  return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

const feeds = [recording('feed', 'show-1-feed'), recording('feed', 'show-2-feed')];
const shows = [
  recording('audiobookshelf', 'index-show-1'),
  recording('audiobookshelf', 'index-show-2'),
];

function text(r: Recording): string {
  const b = r.response.body;
  if (b === null || !('text' in b)) throw new Error(`${r.call}: expected a text body`);
  return b.text;
}

function feedUrl(show: Recording): string {
  const b = show.response.body;
  if (b === null || !('json' in b)) throw new Error(show.call);
  return (b.json as { media: { metadata: { feedUrl: string } } }).media.metadata.feedUrl;
}

const rss = (channel: string) =>
  `<?xml version="1.0"?><rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${channel}</channel></rss>`;

describe('reading a show’s feed', () => {
  it('names the recorded serial show serial and the episodic one episodic', () => {
    expect(feeds.map((f) => parseFeed(text(f)).order)).toEqual(['serial', 'episodic']);
  });

  it('gives every recorded item its date, guid and enclosure URL, entities decoded, in feed order', () => {
    const feed = parseFeed(text(feeds[0]!));
    expect(feed.episodes.map((e) => e.publishedAt)).toEqual([
      Date.parse('Fri, 08 Sep 2023 04:00:00 +0000'),
      Date.parse('Thu, 07 Sep 2023 04:00:00 +0000'),
      Date.parse('Wed, 06 Sep 2023 04:00:00 +0000'),
      Date.parse('Tue, 05 Sep 2023 04:00:00 +0000'),
    ]);
    expect(feed.episodes[3]?.guid).toBe('61efe1aa-d65e-486e-b68b-b073017b8a9d');
    for (const episode of feed.episodes) {
      expect(episode.enclosureUrl).toMatch(/^https:\/\/.*\?utm_source=Podcast&in_playlist=/);
    }
    expect(parseFeed(text(feeds[1]!)).episodes).toHaveLength(15);
  });

  it("fetches a show's feed from the URL Audiobookshelf keeps for it", async () => {
    for (const [n, show] of shows.entries()) {
      const feed = await readFeed(replayFetch([feeds[n]!]), feedUrl(show));
      expect(feed.episodes.length).toBeGreaterThan(0);
    }
  });

  it('leaves the order unknown when the feed names none, or names something else', () => {
    expect(parseFeed(rss('<title>t</title>')).order).toBeNull();
    expect(parseFeed(rss('<itunes:type>weekly</itunes:type>')).order).toBeNull();
    expect(parseFeed(rss('<itunes:type> Serial </itunes:type>')).order).toBe('serial');
  });

  it('keeps an item with no date, guid or enclosure, with each left unknown', () => {
    const feed = parseFeed(rss('<item><title>Only a title</title><pubDate>soon</pubDate></item>'));
    expect(feed.episodes).toEqual([{ guid: null, enclosureUrl: null, publishedAt: null }]);
  });

  it('refuses anything that is not an RSS feed', () => {
    expect(() => parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toThrow();
    expect(() => parseFeed('not xml at all <')).toThrow();
  });

  it('fails as a parse error on a feed it cannot read, and on one past the byte cap', async () => {
    const answer =
      (body: string): FetchLike =>
      async () =>
        new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });
    await expect(readFeed(answer('<html></html>'), 'https://feeds.invalid/a.rss')).rejects.toThrow(
      AdapterError,
    );
    const huge = rss(`<title>${'x'.repeat(FEED_MAX_BYTES)}</title>`);
    await expect(readFeed(answer(huge), 'https://feeds.invalid/a.rss')).rejects.toMatchObject({
      kind: 'parse',
    });
  });

  it('asks only for http or https feeds', async () => {
    const never: FetchLike = async () => {
      throw new Error('fetched');
    };
    await expect(readFeed(never, 'file:///etc/passwd')).rejects.toThrow(/http/);
  });
});
