import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { type Recording, recordingSchema } from '../http/recording.js';
import { replayFetch } from '../http/replay.js';
import { clientVersion, SONGS_FILTER, YtMusicClient } from './client.js';

const here = dirname(fileURLToPath(import.meta.url));
const recording = (call: string) =>
  recordingSchema.parse(JSON.parse(readFileSync(join(here, 'recordings', `${call}.json`), 'utf8')));

const searchSongs = recording('search-songs');
const searchSeveral = recording('search-songs-several');
const nextRadio = recording('next-radio');
const badVersion = recording('search-bad-version');
const SEED = 'lYBUbBu4W08';
const NOW = Date.UTC(2026, 10, 7, 12);

type Json = Record<string, never>;
const client = (recordings: Recording[], onBad?: (what: string) => void) =>
  new YtMusicClient({
    baseUrl: 'http://upstream.invalid',
    fetch: replayFetch(recordings),
    now: () => NOW,
    onBad,
  });

/** A recording with its JSON answer changed by `edit`: the only change, named by each test. */
function edited(r: Recording, edit: (json: Json) => void): Recording {
  const copy = structuredClone(r);
  edit((copy.response.body as { json: Json }).json);
  return copy;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- each test reaches one field of a recording */
const shelfRows = (json: any): any[] =>
  json.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer.contents.find(
    (c: any) => c.musicShelfRenderer,
  ).musicShelfRenderer.contents;
const panelRows = (json: any): any[] =>
  json.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer
    .watchNextTabbedResultsRenderer.tabs[0].tabRenderer.content.musicQueueRenderer.content
    .playlistPanelRenderer.contents;
const titleRun = (row: any) =>
  row.musicResponsiveListItemRenderer.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text
    .runs[0];
const bylineOf = (row: any) =>
  row.musicResponsiveListItemRenderer.flexColumns[1].musicResponsiveListItemFlexColumnRenderer.text;
const setType = (run: any, type: string) => {
  run.navigationEndpoint.watchEndpoint.watchEndpointMusicSupportedConfigs.watchEndpointMusicConfig.musicVideoType =
    type;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('[M3.ytmusic/a] searching YouTube Music, on recordings', () => {
  it("[M3.ytmusic/a] a search's first row gives its title, artists, album, length, art and id", async () => {
    const [first] = await client([searchSongs]).search('Never Gonna Give You Up');
    expect(first).toEqual({
      id: SEED,
      title: 'Never Gonna Give You Up',
      artists: ['Rick Astley'],
      album: 'Whenever You Need Somebody',
      duration: 214,
      artUrl: expect.stringMatching(/^https:\/\/[\w.]+\.googleusercontent\.com\/\S+=w\d+-h\d+/),
      type: 'ATV',
    });
  });

  it('[M3.ytmusic/a] every row recorded parses, none dropped', async () => {
    const bad: string[] = [];
    const songs = await client([searchSongs], (what) => bad.push(what)).search('q');
    expect(songs.length).toBe(shelfRows((searchSongs.response.body as { json: Json }).json).length);
    expect(bad).toEqual([]);
  });

  it('[M3.ytmusic/a] several artists come apart, each name as the upstream gives it', async () => {
    const songs = await client([searchSeveral]).search('q');
    const several = songs.filter((s) => s.artists.length > 1);
    expect(several.length).toBeGreaterThan(0);
    for (const song of songs) {
      for (const name of song.artists) expect(name).not.toMatch(/^[\s,&]|[\s,&]$/);
    }
  });

  it('[M3.ytmusic/a] a user upload is dropped, with nothing said: it is not malformed', async () => {
    const bad: string[] = [];
    const upload = edited(searchSongs, (json) => {
      setType(titleRun(shelfRows(json)[1]), 'MUSIC_VIDEO_TYPE_UGC');
    });
    const all = await client([searchSongs]).search('q');
    const songs = await client([upload], (what) => bad.push(what)).search('q');
    expect(songs.map((s) => s.id)).toEqual(all.filter((_, n) => n !== 1).map((s) => s.id));
    expect(bad).toEqual([]);
  });

  it('[M3.ytmusic/a] an official video keeps its place: it is a song here, and only its audio plays', async () => {
    const video = edited(searchSongs, (json) => {
      setType(titleRun(shelfRows(json)[1]), 'MUSIC_VIDEO_TYPE_OMV');
    });
    const songs = await client([video]).search('q');
    expect(songs[1]?.type).toBe('OMV');
  });

  it('[M3.ytmusic/a] a malformed row is dropped alone and told of', async () => {
    const bad: string[] = [];
    const broken = edited(searchSongs, (json) => {
      delete shelfRows(json)[2].musicResponsiveListItemRenderer.flexColumns;
    });
    const all = await client([searchSongs]).search('q');
    const songs = await client([broken], (what) => bad.push(what)).search('q');
    expect(songs.map((s) => s.id)).toEqual(all.filter((_, n) => n !== 2).map((s) => s.id));
    expect(bad).toHaveLength(1);
  });

  it('[M3.ytmusic/a] a row with no length is malformed: nothing plays without one', async () => {
    const bad: string[] = [];
    const noLength = edited(searchSongs, (json) => {
      const byline = bylineOf(shelfRows(json)[0]);
      byline.runs = byline.runs.slice(0, 3);
    });
    const songs = await client([noLength], (what) => bad.push(what)).search('q');
    expect(songs.map((s) => s.id)).not.toContain(SEED);
    expect(bad).toHaveLength(1);
  });

  it('[M3.ytmusic/a] a row with no album has a null album', async () => {
    const noAlbum = edited(searchSongs, (json) => {
      const byline = bylineOf(shelfRows(json)[0]);
      byline.runs = [byline.runs[0], byline.runs[1], byline.runs[4]];
    });
    const [first] = await client([noAlbum]).search('q');
    expect(first).toMatchObject({ artists: ['Rick Astley'], album: null, duration: 214 });
  });

  it('[M3.ytmusic/a] an answer with no shelf is no rows, with nothing said', async () => {
    const bad: string[] = [];
    const none = edited(searchSongs, (json) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- one field of a recording
      const tabs = (json as any).contents.tabbedSearchResultsRenderer.tabs;
      tabs[0].tabRenderer.content.sectionListRenderer.contents = [];
    });
    expect(await client([none], (what) => bad.push(what)).search('q')).toEqual([]);
    expect(bad).toEqual([]);
  });

  it('[M3.ytmusic/a] an answer of another shape is no rows, and told of', async () => {
    const bad: string[] = [];
    const other = edited(searchSongs, (json) => {
      delete (json as { contents?: unknown }).contents;
    });
    expect(await client([other], (what) => bad.push(what)).search('q')).toEqual([]);
    expect(bad).toHaveLength(1);
  });

  it('[M3.ytmusic/a] a refusal is thrown, not taken for no rows', async () => {
    expect(badVersion.response.status).toBe(404);
    const error = await client([badVersion])
      .search('q')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).status).toBe(404);
  });

  it("[M3.ytmusic/a] asks with today's client version, from the clock it is given, and no credential", async () => {
    expect(clientVersion(NOW)).toBe('1.20261107.01.00');
    const sent: { url: string; init?: RequestInit }[] = [];
    const replay = replayFetch([searchSongs]);
    const fetch: FetchLike = (url, init) => {
      sent.push({ url, init });
      return replay(url, init);
    };
    await new YtMusicClient({ baseUrl: 'http://upstream.invalid', fetch, now: () => NOW }).search(
      'a query',
    );
    const body = JSON.parse(sent[0]?.init?.body as string) as {
      context: { client: Record<string, string> };
      query: string;
      params: string;
    };
    expect(body.context.client).toMatchObject({
      clientName: 'WEB_REMIX',
      clientVersion: '1.20261107.01.00',
      hl: 'en',
    });
    expect(body).toMatchObject({ query: 'a query', params: SONGS_FILTER });
    const headers = new Headers(sent[0]?.init?.headers);
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(new URL(sent[0]?.url ?? '').pathname).toBe('/youtubei/v1/search');
  });
});

describe('[M3.ytmusic/a] the radio YouTube Music makes from a song, on recordings', () => {
  it('[M3.ytmusic/a] gives the rows minus the seed, each with what a play needs', async () => {
    const rows = panelRows((nextRadio.response.body as { json: Json }).json);
    expect(rows[0].playlistPanelVideoRenderer.videoId).toBe(SEED);
    const songs = await client([nextRadio]).radio(SEED);
    expect(songs.length).toBe(rows.length - 1);
    expect(songs.map((s) => s.id)).not.toContain(SEED);
    for (const song of songs) {
      expect(song.id).toMatch(/^[\w-]{11}$/);
      expect(song.title).not.toBe('');
      expect(song.artists.length).toBeGreaterThan(0);
      expect(song.duration).toBeGreaterThan(0);
    }
  });

  it('[M3.ytmusic/a] asks for the radio of that song, audio only', async () => {
    const sent: string[] = [];
    const replay = replayFetch([nextRadio]);
    const fetch: FetchLike = (url, init) => {
      sent.push(init?.body as string);
      return replay(url, init);
    };
    await new YtMusicClient({ baseUrl: 'http://upstream.invalid', fetch, now: () => NOW }).radio(
      SEED,
    );
    expect(JSON.parse(sent[0] ?? '')).toMatchObject({
      videoId: SEED,
      playlistId: `RDAMVM${SEED}`,
      isAudioOnly: true,
    });
  });

  it('[M3.ytmusic/a] a user upload in the radio is dropped, and a malformed row alone', async () => {
    const bad: string[] = [];
    const mixed = edited(nextRadio, (json) => {
      const rows = panelRows(json);
      setType(
        { navigationEndpoint: rows[1].playlistPanelVideoRenderer.navigationEndpoint },
        'MUSIC_VIDEO_TYPE_UGC',
      );
      delete rows[2].playlistPanelVideoRenderer.lengthText;
    });
    const all = await client([nextRadio]).radio(SEED);
    const songs = await client([mixed], (what) => bad.push(what)).radio(SEED);
    expect(songs.map((s) => s.id)).toEqual(all.slice(2).map((s) => s.id));
    expect(bad).toHaveLength(1);
  });
});

describe('[M3.ytmusic/a] what InnerTube renames is told of', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any -- each test reaches one field of a recording */
  const sections = (json: any): any[] =>
    json.contents.tabbedSearchResultsRenderer.tabs[0].tabRenderer.content.sectionListRenderer
      .contents;

  it('[M3.ytmusic/a] an artist whose name begins with & keeps it', async () => {
    const renamed = edited(searchSongs, (json) => {
      bylineOf(shelfRows(json)[0]).runs[0].text = '&TEAM';
    });
    const [first] = await client([renamed]).search('q');
    expect(first?.artists).toEqual(['&TEAM']);
  });

  it('[M3.ytmusic/a] a shelf renamed upstream is told of, not taken for a search that found nothing', async () => {
    const bad: string[] = [];
    const renamed = edited(searchSongs, (json) => {
      for (const section of sections(json)) {
        if (section.musicShelfRenderer === undefined) continue;
        section.musicShelfRendererV2 = section.musicShelfRenderer;
        delete section.musicShelfRenderer;
      }
    });
    expect(await client([renamed], (what) => bad.push(what)).search('q')).toEqual([]);
    expect(bad.length).toBeGreaterThan(0);
  });

  it('[M3.ytmusic/a] a radio panel renamed upstream is told of, not taken for no radio', async () => {
    const bad: string[] = [];
    const renamed = edited(nextRadio, (json: any) => {
      const tab =
        json.contents.singleColumnMusicWatchNextResultsRenderer.tabbedRenderer
          .watchNextTabbedResultsRenderer.tabs[0].tabRenderer;
      tab.content.musicQueueRendererV2 = tab.content.musicQueueRenderer;
      delete tab.content.musicQueueRenderer;
    });
    expect(await client([renamed], (what) => bad.push(what)).radio(SEED)).toEqual([]);
    expect(bad.length).toBeGreaterThan(0);
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
});
