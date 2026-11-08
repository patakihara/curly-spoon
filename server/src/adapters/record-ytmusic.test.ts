import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type FetchLike } from './http/fetch.js';
import { recordingSchema } from './http/recording.js';
import { type RawExchange } from './http/scrub.js';
import {
  ADDRESS_ECHO_URL,
  echoedAddress,
  recordYtMusic,
  SEARCH_KEPT_ROWS,
  SERVER_ECHO_ARGV,
  trimYtMusicExchange,
  YTMUSIC_TRIMMED,
} from './record-ytmusic.js';

const ADDRESS = '85.76.1.2';
const echo = (address: string) => `fl=1\nh=www.example\nip=${address}\nts=1\n`;

function raw(json: unknown): RawExchange {
  return {
    upstream: 'ytmusic',
    upstreamVersion: 'v',
    call: 'c',
    request: { method: 'POST', url: 'https://music.youtube.com/x', headers: {}, body: null },
    response: { status: 200, headers: {}, body: { json } },
  };
}

describe("the recorder's trim of an InnerTube answer", () => {
  const trimmed = (json: unknown) =>
    (trimYtMusicExchange(raw(json)).response.body as { json: Record<string, unknown> }).json;

  it('takes out tracking, session and menu values at any depth, the visitor id aside, and says so', () => {
    const out = trimmed({
      responseContext: { visitorData: 'v', serviceTrackingParams: [] },
      trackingParams: 't',
      contents: { deep: [{ clickTrackingParams: 'c', menu: {}, keep: 1 }] },
    });
    expect(out).toEqual({
      responseContext: { visitorData: 'v' },
      contents: { deep: [{ keep: 1 }] },
      trimmed: YTMUSIC_TRIMMED,
    });
  });

  it("cuts a player's answer to its status, track and format rows, each URL rebuilt", () => {
    const out = trimmed({
      playabilityStatus: { status: 'OK', playableInEmbed: true },
      videoDetails: { videoId: 'lYBUbBu4W08', lengthSeconds: '214', author: 'a', thumbnail: {} },
      streamingData: {
        expiresInSeconds: '21540',
        serverAbrStreamingUrl: 'https://rr1---sn-abcdefgh.googlevideo.com/x',
        adaptiveFormats: [
          {
            itag: 251,
            mimeType: 'audio/webm; codecs="opus"',
            loudnessDb: 1,
            url: 'https://rr1---sn-abcdefgh.googlevideo.com/videoplayback?expire=1&itag=251&ip=85.76.1.2&bui=AbCdEf123456789xyz',
          },
        ],
      },
      playerConfig: {},
      storyboards: {},
    });
    expect(out).toEqual({
      playabilityStatus: { status: 'OK' },
      videoDetails: { videoId: 'lYBUbBu4W08', lengthSeconds: '214' },
      streamingData: {
        adaptiveFormats: [
          {
            itag: 251,
            mimeType: 'audio/webm; codecs="opus"',
            url: 'https://rr0---sn-recorded.googlevideo.com/videoplayback?expire=1&itag=251&ip=<token>&sig=<token>&lsig=<token>&n=<token>&ei=<token>',
          },
        ],
      },
      trimmed: YTMUSIC_TRIMMED,
    });
  });

  it('keeps the first rows of a shelf', () => {
    const rows = Array.from({ length: 20 }, (_, n) => ({ n }));
    const out = trimmed({ a: { musicShelfRenderer: { title: 'Songs', contents: rows } } });
    const shelf = (out.a as { musicShelfRenderer: { title: string; contents: unknown[] } })
      .musicShelfRenderer;
    expect(shelf.contents).toEqual(rows.slice(0, SEARCH_KEPT_ROWS));
    expect(shelf.title).toBe('Songs');
  });
});

describe('the address check before recording', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('reads the address from the echo, and fails on a page that names none', () => {
    expect(echoedAddress(echo(ADDRESS))).toBe(ADDRESS);
    expect(() => echoedAddress('fl=1\n')).toThrow('names no address');
  });

  it('reads the server side through a throwaway container: --rm, no account, no volume', () => {
    expect(SERVER_ECHO_ARGV).toContain('--rm');
    expect(SERVER_ECHO_ARGV.at(-1)).toBe(ADDRESS_ECHO_URL);
    expect(SERVER_ECHO_ARGV.join(' ')).not.toMatch(/-v |--volume|--env|-e /);
  });

  it('refuses when this machine leaves by another address, and never prints either', async () => {
    root = mkdtempSync(join(tmpdir(), 'ytmusic-'));
    const asked: string[] = [];
    const fetch: FetchLike = async (url) => {
      asked.push(url);
      return new Response(echo(ADDRESS));
    };
    const lines: string[] = [];
    const run = recordYtMusic({
      fetch,
      root,
      out: (line) => lines.push(line),
      baseUrl: 'https://music.youtube.com',
      now: () => 0,
      serverEcho: async () => echo('85.76.9.9'),
    });
    const error = await run.then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toContain("does not leave by the server's public address");
    expect(asked).toEqual([ADDRESS_ECHO_URL]);
    expect(existsSync(join(root, 'ytmusic'))).toBe(false);
    expect(`${lines.join('\n')}${error?.message}`).not.toContain('85.76');
  });

  it('never lets the address into what it writes', async () => {
    root = mkdtempSync(join(tmpdir(), 'ytmusic-'));
    const shelf = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: { sectionListRenderer: { contents: [] } },
              },
            },
          ],
        },
      },
      seenFrom: ADDRESS,
    };
    const fetch: FetchLike = async (url) =>
      url === ADDRESS_ECHO_URL
        ? new Response(echo(ADDRESS))
        : new Response(JSON.stringify(shelf), {
            headers: { 'content-type': 'application/json' },
          });
    const error = await recordYtMusic({
      fetch,
      root,
      out: () => undefined,
      baseUrl: 'https://music.youtube.com',
      now: () => 0,
      serverEcho: async () => echo(ADDRESS),
    }).catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain('nothing to make a radio from');
    const file = join(root, 'ytmusic', 'recordings', 'search-songs.json');
    const written = readFileSync(file, 'utf8');
    expect(written).not.toContain(ADDRESS);
    expect(recordingSchema.parse(JSON.parse(written)).upstream).toBe('ytmusic');
  });
});
