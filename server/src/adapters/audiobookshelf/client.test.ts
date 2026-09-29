import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { AbsClient, contentUrlParts, hlsSessionOf } from './client.js';
import { hlsPlaylistSchema, MAX_PLAYLIST_BYTES } from './schemas.js';

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

/** An injected fetch that answers every request with `answer` and keeps what was sent. */
function fake(answer: unknown = {}) {
  const sent: Sent[] = [];
  const fetch: FetchLike = async (url, init) => {
    sent.push({
      url,
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetch, sent };
}

const session = {
  id: 'play_1',
  playMethod: 0,
  audioTracks: [{ contentUrl: '/api/items/li_1/file/1', mimeType: 'audio/mpeg' }],
};

describe('the Audiobookshelf client', () => {
  it('play offers the types the clients play and lets ABS choose, never an empty body', async () => {
    const { fetch, sent } = fake(session);
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const played = await abs.play('li_1', { deviceId: 'auralis-recorder', clientVersion: '0.0.0' });
    expect(played.id).toBe('play_1');

    const [req] = sent;
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('http://upstream.invalid/api/items/li_1/play');
    expect(req?.headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(req?.body ?? 'null');
    expect(body.forceDirectPlay).toBe(false);
    expect(body.forceTranscode).toBe(false);
    expect(body.supportedMimeTypes).toEqual(expect.arrayContaining(['audio/mpeg', 'audio/mp4']));
    expect(body.mediaPlayer).toBe('html5');
    expect(body.deviceInfo).toEqual({
      clientName: 'Auralis',
      clientVersion: '0.0.0',
      deviceId: 'auralis-recorder',
    });
  });

  it('play can ask for a transcode, as record mode does to record the HLS path', async () => {
    const { fetch, sent } = fake(session);
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    await abs.play('li_1', { deviceId: 'd', clientVersion: '0' }, { forceTranscode: true });
    const body = JSON.parse(sent[0]?.body ?? 'null');
    expect(body.forceTranscode).toBe(true);
    expect(body.forceDirectPlay).toBe(false);
  });

  it("an HLS track's content URL names its session, and nothing else does", () => {
    expect(hlsSessionOf('/hls/dacf8c11-47a6-4528-a2c9-4e2f5f2f7ace/output.m3u8')).toBe(
      'dacf8c11-47a6-4528-a2c9-4e2f5f2f7ace',
    );
    expect(hlsSessionOf('/hls/a/../output.m3u8')).toBeNull();
    expect(hlsSessionOf('/hls/a/output-0.ts')).toBeNull();
    expect(hlsSessionOf('/api/items/li_1/file/45152')).toBeNull();
  });

  it('reads an HLS playlist as text, asked with the key', async () => {
    const playlist = '#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:6,\noutput-0.ts\n#EXT-X-ENDLIST\n';
    const sent: Sent[] = [];
    const fetch: FetchLike = async (url, init) => {
      sent.push({ url, method: 'GET', headers: new Headers(init?.headers), body: undefined });
      return new Response(playlist, {
        headers: { 'content-type': 'application/vnd.apple.mpegurl' },
      });
    };
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    expect(await abs.getHlsPlaylist('play_1')).toBe(playlist);
    expect(sent[0]?.url).toBe('http://upstream.invalid/hls/play_1/output.m3u8');
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer the-key');
  });

  it('keeps the recorded playlist as it is, and cuts any query off a segment name, a token included', () => {
    const recorded = (
      JSON.parse(
        readFileSync(new URL('./recordings/hls-playlist.json', import.meta.url), 'utf8'),
      ) as { response: { body: { text: string } } }
    ).response.body.text;
    expect(hlsPlaylistSchema.parse(recorded)).toBe(recorded);
    const withToken = recorded.replace(/^(output-\d+\.ts)$/gm, '$1?token=the-key');
    expect(withToken).toContain('?token=the-key');
    expect(hlsPlaylistSchema.parse(withToken)).toBe(recorded);
    const fmp4 =
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4?token=the-key"\n#EXTINF:6,\noutput-0.m4s?token=the-key\n';
    expect(hlsPlaylistSchema.parse(fmp4)).toBe(
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\noutput-0.m4s\n',
    );
  });

  it('refuses a playlist naming anything but its own segments', () => {
    for (const line of [
      'http://elsewhere.invalid/output-0.ts',
      '../output-0.ts',
      'output-0.ts x',
    ]) {
      expect(hlsPlaylistSchema.safeParse(`#EXTM3U\n#EXTINF:6,\n${line}\n`).success, line).toBe(
        false,
      );
    }
  });

  it('stops reading a playlist past its byte cap, as a parse error, without reading the rest', async () => {
    const chunk = new TextEncoder().encode(`#EXTINF:6,\noutput-0.ts\n`.repeat(2048));
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += chunk.byteLength;
        controller.enqueue(
          pulled === chunk.byteLength ? new TextEncoder().encode('#EXTM3U\n') : chunk,
        );
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch: FetchLike = async () =>
      new Response(endless, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await abs.getHlsPlaylist('play_1').catch((e: unknown) => e)) as AdapterError;
    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure.kind).toBe('parse');
    expect(failure.message).toContain('larger than');
    expect(cancelled).toBe(true);
    // The stream pulls a chunk or two ahead of the reader; nothing near the whole body.
    expect(pulled).toBeLessThan(MAX_PLAYLIST_BYTES + 4 * chunk.byteLength);
  });

  it('refuses an HLS playlist that is not one, as a parse error', async () => {
    const fetch: FetchLike = async () =>
      new Response('<html>', { headers: { 'content-type': 'text/html' } });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await abs.getHlsPlaylist('play_1').catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('parse');
    expect(failure.message).toContain('GET /hls/play_1/output.m3u8');
  });

  it('opens an HLS segment as a stream, passing the range, and refuses one that is not a segment', async () => {
    const ranges: (string | null)[] = [];
    let type = 'video/mp2t';
    const fetch: FetchLike = async (_url, init) => {
      ranges.push(new Headers(init?.headers).get('range'));
      return new Response(new Uint8Array([0x47]), { headers: { 'content-type': type } });
    };
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const segment = await abs.openHlsSegment('play_1', 'output-0.ts', 'bytes=0-');
    expect(segment.status).toBe(200);
    expect(segment.headers['content-type']).toBe('video/mp2t');
    expect(ranges).toEqual(['bytes=0-']);
    await segment.body.cancel();
    type = 'text/html';
    const failure = (await abs
      .openHlsSegment('play_1', 'output-0.ts')
      .catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('parse');
  });

  it('every call sends the ABS key as a bearer token', async () => {
    const { fetch, sent } = fake({
      ...session,
      libraries: [],
      total: 0,
      results: [],
      mediaType: 'book',
      media: {},
    });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    await abs.getLibraries();
    await abs.getLibraryItems('lib1', { limit: 1, page: 0 });
    await abs.getItem('li_1');
    await abs.play('li_1', { deviceId: 'd', clientVersion: '0' });
    await abs.closeSession('play_1');
    expect(sent).toHaveLength(5);
    for (const req of sent) expect(req.headers.get('authorization')).toBe('Bearer the-key');
  });

  it('a library page is minified, and sorted oldest added first only when asked', async () => {
    const { fetch, sent } = fake({ total: 0, results: [] });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    await abs.getLibraryItems('lib1', { limit: 2, page: 4, sort: 'addedAt' });
    await abs.getLibraryItems('lib1', { limit: 1, page: 0 });
    const queries = sent.map((s) => Object.fromEntries(new URL(s.url).searchParams));
    expect(queries).toEqual([
      { limit: '2', page: '4', minified: '1', sort: 'addedAt' },
      { limit: '1', page: '0', minified: '1' },
    ]);
  });

  it('the server version is read without the key', async () => {
    const { fetch, sent } = fake({ serverVersion: '2.36.1', isInit: true });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    expect(await abs.getServerVersion()).toBe('2.36.1');
    expect(sent[0]?.url).toBe('http://upstream.invalid/status');
    expect(sent[0]?.headers.get('authorization')).toBeNull();
  });

  it('a response that does not match the schema fails as a parse error naming the call', async () => {
    const { fetch } = fake({ libraries: 'not a list' });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = await abs.getLibraries().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AdapterError);
    expect((failure as AdapterError).kind).toBe('parse');
    expect((failure as AdapterError).message).toContain('GET /api/libraries');
  });

  it('a non-2xx answer fails as a status error with the status', async () => {
    const fetch: FetchLike = async () => new Response('Unauthorized', { status: 401 });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await abs.getLibraries().catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('status');
    expect(failure.status).toBe(401);
  });

  it('openFile asks for the file with the range and the key, and hands back its audio stream', async () => {
    const sent: Sent[] = [];
    const fetch: FetchLike = async (url, init) => {
      sent.push({
        url,
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: undefined,
      });
      return new Response(new Uint8Array([1, 2]), {
        status: 206,
        headers: {
          'content-type': 'audio/mp4',
          'accept-ranges': 'bytes',
          'content-range': 'bytes 0-1/100',
          'content-length': '2',
        },
      });
    };
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    const file = await abs.openFile({ itemId: 'li_1', ino: '7' }, 'bytes=0-1');
    expect(sent[0]?.url).toBe('http://upstream.invalid/api/items/li_1/file/7');
    expect(sent[0]?.headers.get('range')).toBe('bytes=0-1');
    expect(sent[0]?.headers.get('authorization')).toBe('Bearer the-key');
    expect(file.status).toBe(206);
    expect(file.headers).toEqual({
      'content-type': 'audio/mp4',
      'accept-ranges': 'bytes',
      'content-range': 'bytes 0-1/100',
      'content-length': '2',
    });
    expect(new Uint8Array(await new Response(file.body).arrayBuffer())).toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it('openFile without a range sends none', async () => {
    let range: string | null = 'unset';
    const fetch: FetchLike = async (_url, init) => {
      range = new Headers(init?.headers).get('range');
      return new Response('x', { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    };
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    expect((await abs.openFile({ itemId: 'li_1', ino: '7' })).status).toBe(200);
    expect(range).toBeNull();
  });

  it('openFile refuses an answer that is not audio, as a parse error naming the call', async () => {
    const fetch: FetchLike = async () =>
      new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await abs
      .openFile({ itemId: 'li_1', ino: '7' })
      .catch((e: unknown) => e)) as AdapterError;
    expect(failure).toBeInstanceOf(AdapterError);
    expect(failure.kind).toBe('parse');
    expect(failure.message).toContain('GET /api/items/li_1/file/7');
  });

  it('openFile fails on a refused range as a status error carrying the status', async () => {
    const fetch: FetchLike = async () =>
      new Response(null, { status: 416, headers: { 'content-range': 'bytes */100' } });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const failure = (await abs
      .openFile({ itemId: 'li_1', ino: '7' }, 'bytes=500-')
      .catch((e: unknown) => e)) as AdapterError;
    expect(failure.kind).toBe('status');
    expect(failure.status).toBe(416);
  });

  it("a direct-play track's content URL names its item and file, and nothing else does", () => {
    expect(contentUrlParts('/api/items/li_1/file/45152')).toEqual({ itemId: 'li_1', ino: '45152' });
    expect(contentUrlParts('/hls/play_1/output.m3u8')).toBeNull();
    expect(contentUrlParts('/api/items/li_1/file/7/download')).toBeNull();
  });
});
