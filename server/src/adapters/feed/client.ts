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
import { type FeedFetch, readCapped } from '../http/publicFetch.js';

/** A feed larger than this is refused rather than read. */
export const FEED_MAX_BYTES = 4 * 1024 * 1024;

/** A feed a client named that takes longer than this, every hop and the body together, fails. */
export const FEED_TIMEOUT_MS = 15_000;

export type EpisodeOrder = 'serial' | 'episodic';

export interface FeedEpisode {
  guid: string | null;
  /** The item's own title, which names its file (stubs/filename.ts). */
  title: string | null;
  description: string | null;
  enclosureUrl: string | null;
  /** The enclosure's declared `length` in bytes; null when absent or not a number. */
  enclosureLength: number | null;
  enclosureType: string | null;
  /** Seconds, from `itunes:duration` (`hh:mm:ss`, `mm:ss` or seconds). */
  duration: number | null;
  /** Milliseconds since the epoch, from `pubDate`. */
  publishedAt: number | null;
}

export interface Feed {
  /** The channel's title; null when it has none. */
  title: string | null;
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

/** `itunes:duration` as seconds: `1:02:03`, `62:03` or `3723`; null when it is none of them. */
export function durationSeconds(value: string | null | undefined): number | null {
  if (value == null || !/^\d+(\.\d+)?(:\d+(\.\d+)?){0,2}$/.test(value.trim())) return null;
  return value
    .trim()
    .split(':')
    .reduce((total, part) => total * 60 + Number(part), 0);
}

const attribute = z.string().optional().catch(undefined);

const itemSchema = z
  .object({
    guid: textOf,
    title: textOf,
    description: textOf,
    pubDate: textOf,
    'itunes:duration': textOf,
    enclosure: z
      .preprocess(
        firstOf,
        z.object({ '@_url': z.string(), '@_length': attribute, '@_type': attribute }).optional(),
      )
      .catch(undefined),
  })
  .transform((item): FeedEpisode => {
    const at = item.pubDate === undefined ? NaN : Date.parse(item.pubDate);
    const length = Number(item.enclosure?.['@_length']?.trim());
    return {
      guid: present(item.guid),
      title: present(item.title),
      description: present(item.description),
      enclosureUrl: present(item.enclosure?.['@_url'].trim()),
      enclosureLength: Number.isSafeInteger(length) && length > 0 ? length : null,
      enclosureType: present(item.enclosure?.['@_type']?.trim()),
      duration: durationSeconds(item['itunes:duration']),
      publishedAt: Number.isNaN(at) ? null : at,
    };
  });

const feedSchema = z
  .object({
    rss: z.object({
      channel: z.object({
        title: textOf,
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
      title: present(channel.title),
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

/**
 * Reads a feed address a client named, through `feedFetch`: at most `FEED_MAX_BYTES`, within
 * `FEED_TIMEOUT_MS`, or until `stop` aborts. Gives the feed and its address after permanent redirects.
 */
export async function readNamedFeed(
  fetch: FeedFetch,
  url: string,
  { timeoutMs = FEED_TIMEOUT_MS, stop }: { timeoutMs?: number; stop?: AbortSignal } = {},
): Promise<{ feed: Feed; url: string }> {
  const call = 'GET feed';
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = stop === undefined ? timeout : AbortSignal.any([timeout, stop]);
  let read: { bytes: Uint8Array | null; url: string; status: number };
  try {
    const { response, url: named } = await fetch(url, {
      headers: { accept: 'application/rss+xml, application/xml' },
      signal,
    });
    const bytes = response.ok ? await readCapped(response, FEED_MAX_BYTES) : new Uint8Array();
    read = { bytes, url: named, status: response.status };
  } catch (cause) {
    if (signal.aborted) throw new AdapterError('timeout', call, 'timed out', undefined, { cause });
    throw cause;
  }
  if (read.status < 200 || read.status > 299) {
    throw new AdapterError('status', call, `answered ${read.status}`, read.status);
  }
  if (read.bytes === null) throw new AdapterError('parse', call, 'past the byte cap');
  try {
    return { feed: parseFeed(new TextDecoder().decode(read.bytes)), url: read.url };
  } catch (cause) {
    throw new AdapterError('parse', call, 'not an RSS feed', undefined, { cause });
  }
}
