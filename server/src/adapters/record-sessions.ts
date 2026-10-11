/**
 * Record mode's `sessions` part: the upstream answers M1.sessions' autoplay reads, made as the
 * service identity `auralis` with Auralis's own keys.
 *
 * - Audiobookshelf: two books of one series, as the index reads them (`series-book-1`, `-2`).
 * - Each of two shows' public feeds, trimmed to what ordering episodes needs (`<n>-feed`).
 * - A finished episode: the first episode of the first show is marked finished for the test user,
 *   `GET /api/me` is recorded (`me-finished`), and the mark is undone and read back.
 * - Jellyfin: Instant Mix for one track (`jf-instant-mix`), through a token minted for `auralis`
 *   by Quick Connect and logged out at the end.
 *
 * Everything else is a read. The Podcasts library is never listed or scanned, and no file is
 * opened, so no podcast stub is hydrated.
 */
import { join } from 'node:path';
import { z } from 'zod';
import { AbsClient } from './audiobookshelf/client.js';
import { type MediaProgress } from './audiobookshelf/schemas.js';
import { type FetchLike, requestJson } from './http/fetch.js';
import { createRecorder } from './http/record.js';
import { type RawExchange } from './http/scrub.js';
import { buildAuthorizationHeader } from './jellyfin/auth.js';
import { JellyfinClient } from './jellyfin/client.js';
import { JellyfinProvisioner, personDevice } from './jellyfin/quickConnect.js';
import { RECORD_USER_ID, TEST_IDENTITY } from './record-oidc.js';

/** How many tracks the Instant Mix recording asks for. */
export const INSTANT_MIX_LIMIT = 20;
/** A feed larger than this is refused rather than read. */
export const FEED_MAX_BYTES = 4 * 1024 * 1024;
/** A feed has no server version; the recording names the format it was read as. */
export const FEED_VERSION = 'RSS 2.0';

/** What a trimmed feed says about itself, first thing inside `<channel>`. */
export const FEED_TRIMMED =
  'Trimmed by the recorder: every item kept in order, with only the elements ordering needs.';

const CHANNEL_KEPT = ['title', 'itunes:type'] as const;
const ITEM_KEPT = [
  'title',
  'guid',
  'pubDate',
  'itunes:season',
  'itunes:episode',
  'itunes:episodeType',
  'itunes:duration',
] as const;

function escaped(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The first `<tag …>…</tag>` or `<tag …/>` in `xml`, verbatim, or undefined. */
function firstElement(xml: string, tag: string): string | undefined {
  const t = escaped(tag);
  const m = new RegExp(`<${t}(?:\\s[^>]*)?(?:/>|>[\\s\\S]*?</${t}>)`).exec(xml);
  return m?.[0];
}

/**
 * Cuts a podcast feed down to the channel's title and `itunes:type`, and each item's title, guid,
 * date, season, episode, type, duration and enclosure, each element verbatim and every item in
 * its order. Show notes, images, links, owner addresses and network ids go: they carry
 * third-party hosts and people's addresses, which the scan rightly fails.
 */
export function trimFeed(xml: string): string {
  const version = /<rss\b[^>]*\bversion="([^"]+)"/.exec(xml)?.[1];
  if (version !== '2.0') throw new Error(`not an RSS 2.0 feed (version ${version ?? 'none'})`);
  const channel = /<channel>([\s\S]*)<\/channel>/.exec(xml)?.[1];
  if (channel === undefined) throw new Error('the feed has no channel');
  const items = [...channel.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1] ?? '');
  const head = channel
    .slice(0, channel.search(/<item>/) >>> 0)
    .replace(/<image>[\s\S]*?<\/image>/g, '');
  const keep = (src: string, tags: readonly string[], indent: string) =>
    tags.flatMap((tag) => {
      const el = firstElement(src, tag);
      return el === undefined ? [] : [`${indent}${el}`];
    });
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">',
    '  <channel>',
    `    <!-- ${FEED_TRIMMED} -->`,
    ...keep(head, CHANNEL_KEPT, '    '),
  ];
  for (const item of items) {
    lines.push('    <item>', ...keep(item, [...ITEM_KEPT, 'enclosure'], '      '), '    </item>');
  }
  lines.push('  </channel>', '</rss>', '');
  return lines.join('\n');
}

/** The recorder's hook: trims a feed answer's text body, leaving anything else as it is. */
export function trimFeedExchange(raw: RawExchange): RawExchange {
  const body = raw.response.body;
  if (body === null || !('text' in body)) return raw;
  return { ...raw, response: { ...raw.response, body: { text: trimFeed(body.text) } } };
}

/** The enclosure URL of a feed's item with the earliest `pubDate`, entities decoded. */
export function oldestEnclosure(xml: string): string | undefined {
  let best: { at: number; url: string } | undefined;
  for (const [, item = ''] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const at = Date.parse(/<pubDate>([^<]*)<\/pubDate>/.exec(item)?.[1] ?? '');
    const raw = /<enclosure\b[^>]*\burl="([^"]*)"/.exec(item)?.[1];
    if (Number.isNaN(at) || raw === undefined) continue;
    const decoded = raw.replace(/&amp;/g, '&');
    if (best === undefined || at < best.at) best = { at, url: decoded };
  }
  return best?.url;
}

export interface SessionsRecordInput {
  fetch: FetchLike;
  out: (line: string) => void;
  root: string;
  absUrl: string;
  jellyfinUrl: string;
  absKey: string;
  jellyfinKey: string;
  /** Two books of one series, in series order. */
  books: [string, string];
  /** Two shows, the first one serial: its first episode is the one marked finished. */
  shows: [string, string];
  /** The track Instant Mix is asked for. */
  mixTrack: string;
}

function url(base: string, path: string): string {
  return new URL(path, base.endsWith('/') ? base : `${base}/`).toString();
}

const comparable = (p: MediaProgress | null) =>
  JSON.stringify(p && [p.id, p.currentTime, p.duration, p.progress, p.isFinished]);

export async function recordSessions(
  input: SessionsRecordInput,
): Promise<{ written: string[]; matches: boolean }> {
  const { absUrl, jellyfinUrl, absKey, jellyfinKey, out } = input;
  const absPlain = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: input.fetch });
  const absVersion = await absPlain.getServerVersion();
  const me = await absPlain.getMe();
  if (me.username !== TEST_IDENTITY) {
    throw new Error(`the Audiobookshelf key belongs to ${me.username}, not ${TEST_IDENTITY}`);
  }
  const absDir = join(input.root, 'audiobookshelf', 'recordings');
  const feedDir = join(input.root, 'feed', 'recordings');
  const jellyfinDir = join(input.root, 'jellyfin', 'recordings');
  const written: string[] = [];

  const absRec = createRecorder({
    fetch: input.fetch,
    dir: absDir,
    upstream: 'audiobookshelf',
    upstreamVersion: absVersion,
    secrets: [absKey],
    baseUrl: absUrl,
  });
  const abs = new AbsClient({ baseUrl: absUrl, token: absKey, fetch: absRec.fetch });
  const absCapture = async <T>(call: string, fn: () => Promise<T>) => {
    const result = await absRec.capture(call, fn);
    written.push(join(absDir, `${call}.json`));
    return result;
  };

  const series = new Set<string>();
  for (const [n, id] of input.books.entries()) {
    const book = await absCapture(`series-book-${n + 1}`, () => abs.getItemSummary(id));
    if (book.mediaType !== 'book') throw new Error(`${id} is not a book`);
    const ids = book.media.metadata.series.map((s) => s.id);
    if (n === 0) ids.forEach((s) => series.add(s));
    else if (!ids.some((s) => series.has(s))) throw new Error('the two books share no series');
  }

  const shows = [];
  const feeds: string[] = [];
  for (const [n, id] of input.shows.entries()) {
    const show = await absPlain.getItemSummary(id);
    if (show.mediaType !== 'podcast') throw new Error(`${id} is not a show`);
    const feedUrl = show.media.metadata.feedUrl;
    if (!feedUrl) throw new Error(`show ${n + 1} has no feed`);
    const feed = new URL(feedUrl);
    const rec = createRecorder({
      fetch: input.fetch,
      dir: feedDir,
      upstream: 'feed',
      upstreamVersion: FEED_VERSION,
      secrets: [absKey],
      baseUrl: feed.origin,
      prepare: trimFeedExchange,
    });
    const call = `show-${n + 1}-feed`;
    const text = await rec.capture(call, () =>
      requestJson(
        rec.fetch,
        feed.toString(),
        { headers: { accept: 'application/rss+xml, application/xml' }, maxBytes: FEED_MAX_BYTES },
        z.string(),
      ),
    );
    written.push(join(feedDir, `${call}.json`));
    shows.push(show);
    feeds.push(text);
  }

  // The finished episode: the serial show's oldest by the feed's dates, matched to ABS's episode
  // by enclosure. ABS's own `publishedAt` can be one date for a whole show (live, show 1).
  const [serial] = shows;
  if (serial === undefined || serial.mediaType !== 'podcast') throw new Error('no first show');
  const oldest = oldestEnclosure(feeds[0] ?? '');
  const episode = serial.media.episodes.find((e) => e.enclosure?.url === oldest);
  if (!episode) throw new Error("no episode of the first show has the feed's oldest enclosure");
  const progressPath = `api/me/progress/${encodeURIComponent(serial.id)}/${encodeURIComponent(episode.id)}`;
  const bearer = { authorization: `Bearer ${absKey}` };
  const readProgress = () => absPlain.findMyEpisodeProgress(serial.id, episode.id);
  const before = await readProgress();
  out(
    `before the run: ${before ? `progress ${before.currentTime} s` : 'no progress'} on the episode`,
  );
  let matches = false;
  try {
    await requestJson(
      input.fetch,
      url(absUrl, progressPath),
      { method: 'PATCH', headers: bearer, json: { isFinished: true } },
      z.unknown(),
    );
    const read = await absCapture('me-finished', () => abs.getMe());
    const mark = read.mediaProgress.find((p) => p.episodeId === episode.id);
    if (!mark?.isFinished) throw new Error('GET /api/me does not list the episode as finished');
  } finally {
    const now = await readProgress();
    if (before === null && now !== null) {
      await requestJson(
        input.fetch,
        url(absUrl, `api/me/progress/${encodeURIComponent(now.id)}`),
        { method: 'DELETE', headers: bearer },
        z.unknown(),
      );
    } else if (before !== null) {
      const { currentTime, duration, progress, isFinished } = before;
      await requestJson(
        input.fetch,
        url(absUrl, progressPath),
        { method: 'PATCH', headers: bearer, json: { currentTime, duration, progress, isFinished } },
        z.unknown(),
      );
    }
    const after = await readProgress();
    matches = comparable(after) === comparable(before);
    out(
      `after the revert: ${after ? `progress ${after.currentTime} s` : 'no progress'} on the episode`,
    );
  }

  const jellyfinVersion = await new JellyfinClient({
    baseUrl: jellyfinUrl,
    token: jellyfinKey,
    fetch: input.fetch,
  }).getServerVersion();
  const provisioner = new JellyfinProvisioner({
    baseUrl: jellyfinUrl,
    apiKey: jellyfinKey,
    fetch: input.fetch,
  });
  const identity = (await provisioner.accounts()).find((a) => a.username === TEST_IDENTITY);
  if (!identity) throw new Error(`Jellyfin has no user ${TEST_IDENTITY}`);
  const device = personDevice(RECORD_USER_ID);
  const { token } = await provisioner.mint(identity.id, RECORD_USER_ID);
  try {
    const jfRec = createRecorder({
      fetch: input.fetch,
      dir: jellyfinDir,
      upstream: 'jellyfin',
      upstreamVersion: jellyfinVersion,
      secrets: [jellyfinKey, token],
      baseUrl: jellyfinUrl,
    });
    const jf = new JellyfinClient({ baseUrl: jellyfinUrl, token, device, fetch: jfRec.fetch });
    const mix = await jfRec.capture('jf-instant-mix', () =>
      jf.getInstantMix(input.mixTrack, INSTANT_MIX_LIMIT),
    );
    written.push(join(jellyfinDir, 'jf-instant-mix.json'));
    out(`Instant Mix answered ${mix.length} tracks`);
  } finally {
    const res = await input.fetch(url(jellyfinUrl, 'Sessions/Logout'), {
      method: 'POST',
      headers: { authorization: buildAuthorizationHeader(device, token) },
    });
    out(`logged out the minted Jellyfin token: ${res.status}`);
  }
  if (matches) out("reverted: the episode's progress reads back as before");
  return { written, matches };
}
