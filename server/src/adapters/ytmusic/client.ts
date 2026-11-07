/**
 * The YouTube Music client: songs by search, and the radio that follows a song, from InnerTube, the
 * service's own API, with no key, cookie or account (checked live). Neither call needs the
 * extractor, so a broken extractor leaves both standing.
 *
 * Only official rows pass: an album's track (`ATV`) or an official video's song (`OMV`), never a
 * user's upload. A bad row is dropped alone, a bad whole answer is no rows, and each is told to
 * `onBad`. A refusal or a network failure is thrown, as every adapter's is.
 *
 * `new YtMusicClient({ baseUrl, fetch, now, timeoutMs?, onBad? })`.
 */
import { AdapterError, type FetchLike, requestJson } from '../http/fetch.js';
import {
  radioAnswerSchema,
  radioRowSchema,
  type Run,
  searchAnswerSchema,
  searchRowSchema,
} from './schemas.js';

export const YTMUSIC_URL = 'https://music.youtube.com';

/** The search filter that lists songs alone: InnerTube's own opaque value (checked live). */
export const SONGS_FILTER = 'EgWKAQIIAWoKEAkQBRAKEAMQBA==';

/** The country asked for: what the server may stream is what its own country gets. */
export const YTMUSIC_COUNTRY = 'FI';

/** An answer larger than this is refused rather than read. A radio of 50 rows is about 600 KB. */
export const YTMUSIC_MAX_BYTES = 4 * 1024 * 1024;

const OFFICIAL_TYPES = {
  MUSIC_VIDEO_TYPE_ATV: 'ATV',
  MUSIC_VIDEO_TYPE_OMV: 'OMV',
} as const;
type OfficialType = (typeof OFFICIAL_TYPES)[keyof typeof OFFICIAL_TYPES];

/** One official song on YouTube Music. Art is the upstream's largest, and never reaches a client. */
export interface YtSong {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  /** Seconds. */
  duration: number;
  artUrl: string | null;
  type: OfficialType;
}

export interface YtMusicClientOptions {
  baseUrl: string;
  fetch: FetchLike;
  /** Milliseconds since the epoch: today's date is the client version InnerTube is told. */
  now: () => number;
  /** The whole call's limit; the transport's default when not given. */
  timeoutMs?: number;
  /** Told of each row dropped as malformed, and of an answer not understood at all. */
  onBad?: (what: string) => void;
}

/** `1.<today>.01.00`, the web player's own form. A year-old date also answers (checked live). */
export function clientVersion(now: number): string {
  const date = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
  return `1.${date}.01.00`;
}

/** `3:34` or `1:02:33` in seconds; null for anything else. */
function seconds(text: string): number | null {
  if (!/^\d+(?::\d{2}){1,2}$/.test(text)) return null;
  return text.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}

/** A byline's parts, as ` • ` divides them. A name may hold a `•` of its own. */
function segments(byline: Run[]): Run[][] {
  const parts: Run[][] = [[]];
  for (const run of byline) {
    if (run.text === ' • ') parts.push([]);
    else parts[parts.length - 1]!.push(run);
  }
  return parts;
}

const pageType = (run: Run) =>
  run.navigationEndpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs
    .browseEndpointContextMusicConfig.pageType;

/**
 * A byline's first part: each run a name, with the `, ` and ` & ` between them taken off. An `&`
 * touching a word belongs to the name, as in `&TEAM`.
 */
function artistsOf(first: Run[]): string[] {
  return first
    .map((run) => run.text.trim())
    .map((text) => (text === '&' ? '' : text))
    .map((text) => text.replace(/^(?:[,\s]|&\s)+|(?:[,\s]|\s&)+$/g, ''))
    .filter((name) => name !== '');
}

function albumOf(parts: Run[][]): string | null {
  return parts.flat().find((run) => pageType(run) === 'MUSIC_PAGE_TYPE_ALBUM')?.text ?? null;
}

function largest(thumbnails: { url: string; width: number }[]): string | null {
  return (
    thumbnails.reduce<{ url: string; width: number } | null>(
      (best, t) => (best === null || t.width > best.width ? t : best),
      null,
    )?.url ?? null
  );
}

const textOf = (runs: Run[]) => runs.map((run) => run.text).join('');

/** The row's official type; null for a user's upload, or a type this client does not know. */
function officialType(musicVideoType: string): OfficialType | null {
  return OFFICIAL_TYPES[musicVideoType as keyof typeof OFFICIAL_TYPES] ?? null;
}

export class YtMusicClient {
  constructor(private readonly opts: YtMusicClientOptions) {}

  /** Official songs for `query`, best first. */
  async search(query: string): Promise<YtSong[]> {
    const answer = await this.ask('search', { query, params: SONGS_FILTER }, searchAnswerSchema);
    if (answer === null) return [];
    const sections = answer.contents.tabbedSearchResultsRenderer.tabs.flatMap(
      (tab) => tab.tabRenderer.content.sectionListRenderer.contents,
    );
    if (sections.length > 0 && sections.every((s) => s.musicShelfRenderer === undefined)) {
      this.opts.onBad?.('search: sections came with no shelf of songs');
    }
    const rows = sections.flatMap((section) => section.musicShelfRenderer?.contents ?? []);
    return this.official(rows, (row) => this.searchRow(row));
  }

  /** The radio YouTube Music makes from a song: official songs in order, the song itself left out. */
  async radio(id: string): Promise<YtSong[]> {
    const answer = await this.ask(
      'next',
      { videoId: id, playlistId: `RDAMVM${id}`, isAudioOnly: true },
      radioAnswerSchema,
    );
    if (answer === null) return [];
    const panels =
      answer.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer.watchNextTabbedResultsRenderer.tabs.flatMap(
        (tab) => tab.tabRenderer.content?.musicQueueRenderer ?? [],
      );
    if (panels.length === 0) this.opts.onBad?.('next: no tab held the radio panel');
    const rows = panels.flatMap((panel) => panel.content.playlistPanelRenderer.contents);
    return this.official(rows, (row) => this.radioRow(row)).filter((song) => song.id !== id);
  }

  private async ask<T>(
    endpoint: string,
    body: Record<string, unknown>,
    schema: Parameters<typeof requestJson<T>>[3],
  ): Promise<T | null> {
    const { baseUrl, fetch, now, timeoutMs } = this.opts;
    const url = new URL(`youtubei/v1/${endpoint}`, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('prettyPrint', 'false');
    const context = {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: clientVersion(now()),
        hl: 'en',
        gl: YTMUSIC_COUNTRY,
      },
    };
    try {
      return await requestJson(
        fetch,
        url.toString(),
        {
          method: 'POST',
          json: { context, ...body },
          maxBytes: YTMUSIC_MAX_BYTES,
          ...(timeoutMs === undefined ? {} : { timeoutMs }),
        },
        schema,
      );
    } catch (error) {
      if (error instanceof AdapterError && error.kind === 'parse') {
        this.opts.onBad?.(`${endpoint}: the answer is not understood`);
        return null;
      }
      throw error;
    }
  }

  private official(rows: unknown[], parse: (row: unknown) => YtSong | 'upload' | 'bad'): YtSong[] {
    const songs: YtSong[] = [];
    for (const row of rows) {
      const song = parse(row);
      if (song === 'bad') this.opts.onBad?.('a row is not understood');
      else if (song !== 'upload') songs.push(song);
    }
    return songs;
  }

  private searchRow(raw: unknown): YtSong | 'upload' | 'bad' {
    const parsed = searchRowSchema.safeParse(raw);
    if (!parsed.success) return 'bad';
    const row = parsed.data.musicResponsiveListItemRenderer;
    const [titleColumn, bylineColumn] = row.flexColumns;
    const titleRuns = titleColumn!.musicResponsiveListItemFlexColumnRenderer.text.runs;
    const watch = titleRuns[0]!.navigationEndpoint?.watchEndpoint;
    if (watch === undefined) return 'bad';
    const parts = segments(bylineColumn!.musicResponsiveListItemFlexColumnRenderer.text.runs);
    const length = textOf(parts[parts.length - 1]!);
    return this.song({
      id: row.playlistItemData.videoId,
      title: textOf(titleRuns),
      musicVideoType:
        watch.watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.musicVideoType,
      parts,
      length,
      thumbnails: row.thumbnail.musicThumbnailRenderer.thumbnail.thumbnails,
    });
  }

  private radioRow(raw: unknown): YtSong | 'upload' | 'bad' {
    const parsed = radioRowSchema.safeParse(raw);
    if (!parsed.success) return 'bad';
    const row = parsed.data.playlistPanelVideoRenderer;
    return this.song({
      id: row.videoId,
      title: textOf(row.title.runs),
      musicVideoType:
        row.navigationEndpoint.watchEndpoint.watchEndpointMusicSupportedConfigs
          .watchEndpointMusicConfig.musicVideoType,
      parts: segments(row.longBylineText.runs),
      length: textOf(row.lengthText.runs),
      thumbnails: row.thumbnail.thumbnails,
    });
  }

  private song(row: {
    id: string;
    title: string;
    musicVideoType: string;
    parts: Run[][];
    length: string;
    thumbnails: { url: string; width: number }[];
  }): YtSong | 'upload' | 'bad' {
    const type = officialType(row.musicVideoType);
    if (type === null) return 'upload';
    const artists = artistsOf(row.parts[0]!);
    const duration = seconds(row.length);
    if (artists.length === 0 || duration === null) return 'bad';
    return {
      id: row.id,
      title: row.title,
      artists,
      album: albumOf(row.parts),
      duration,
      artUrl: largest(row.thumbnails),
      type,
    };
  }
}
