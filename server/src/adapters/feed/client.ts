/**
 * A show's public podcast feed: what ordering its episodes needs. The XML is parsed into a plain
 * object, which zod then reads, so nothing past this file sees the feed's raw shape.
 *
 * - `order`: the channel's `itunes:type`, `serial` or `episodic`; null when the feed names
 *   neither, and the reader picks the default.
 * - Each item's date, guid and enclosure URL, in feed order, so an episode Audiobookshelf holds
 *   can be matched to its item. Audiobookshelf's own dates can be wrong (recorded: show 1's first
 *   part is dated by its year alone, 1 January), so the feed's are the ones that order.
 */
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';

/** A feed larger than this is refused rather than read. */
export const FEED_MAX_BYTES = 4 * 1024 * 1024;

export type EpisodeOrder = 'serial' | 'episodic';

export interface FeedEpisode {
  guid: string | null;
  enclosureUrl: string | null;
  /** Milliseconds since the epoch, from `pubDate`. */
  publishedAt: number | null;
}

export interface Feed {
  order: EpisodeOrder | null;
  episodes: FeedEpisode[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (_name, jpath) => jpath === 'rss.channel.item',
});

/** An element given twice or more parses as an array; the first one counts. */
const firstOf = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** A text element, bare or carrying attributes (`<guid isPermaLink="false">…</guid>`). */
const textOf = z
  .preprocess(
    firstOf,
    z.union([z.string(), z.number(), z.object({ '#text': z.union([z.string(), z.number()]) })]),
  )
  .transform((v) => String(typeof v === 'object' ? v['#text'] : v).trim())
  .optional()
  .catch(undefined);

const present = (v: string | undefined): string | null => (v === undefined || v === '' ? null : v);

const itemSchema = z
  .object({
    guid: textOf,
    pubDate: textOf,
    enclosure: z.preprocess(firstOf, z.object({ '@_url': z.string() }).optional()).catch(undefined),
  })
  .transform((item): FeedEpisode => {
    const at = item.pubDate === undefined ? NaN : Date.parse(item.pubDate);
    return {
      guid: present(item.guid),
      enclosureUrl: present(item.enclosure?.['@_url'].trim()),
      publishedAt: Number.isNaN(at) ? null : at,
    };
  });

const feedSchema = z
  .object({
    rss: z.object({
      channel: z.object({
        'itunes:type': textOf,
        // An item that is not an element (`<item>hello</item>`, `<item></item>`) is skipped;
        // the rest of the feed still reads.
        item: z.array(itemSchema.nullable().catch(null)).default([]),
      }),
    }),
  })
  .transform(({ rss: { channel } }): Feed => {
    const type = channel['itunes:type']?.toLowerCase();
    return {
      order: type === 'serial' || type === 'episodic' ? type : null,
      episodes: channel.item.filter((e): e is FeedEpisode => e !== null),
    };
  });

/** Reads an RSS feed's text; throws when it is not XML or not an RSS channel. */
export function parseFeed(xml: string): Feed {
  return feedSchema.parse(parser.parse(xml, true));
}

/** Fetches and reads one show's feed, reading at most `FEED_MAX_BYTES`. */
export async function readFeed(fetch: FetchLike, url: string): Promise<Feed> {
  const { protocol, pathname } = new URL(url);
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`a feed is read over http or https, not ${protocol}`);
  }
  const xml = await requestJson(
    fetch,
    url,
    { headers: { accept: 'application/rss+xml, application/xml' }, maxBytes: FEED_MAX_BYTES },
    z.string(),
  );
  try {
    return parseFeed(xml);
  } catch (cause) {
    throw new AdapterError('parse', `GET ${pathname}`, 'not an RSS feed', undefined, { cause });
  }
}
