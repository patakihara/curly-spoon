import { describe, expect, it } from 'vitest';
import { AdapterError, type FetchLike } from '../http/fetch.js';
import { AbsClient } from './client.js';

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
  it('play posts a direct-play body with supported mime types, never an empty body', async () => {
    const { fetch, sent } = fake(session);
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'k', fetch });
    const played = await abs.play('li_1', { deviceId: 'auralis-recorder', clientVersion: '0.0.0' });
    expect(played.id).toBe('play_1');

    const [req] = sent;
    expect(req?.method).toBe('POST');
    expect(req?.url).toBe('http://upstream.invalid/api/items/li_1/play');
    expect(req?.headers.get('content-type')).toBe('application/json');
    const body = JSON.parse(req?.body ?? 'null');
    expect(body.forceDirectPlay).toBe(true);
    expect(body.supportedMimeTypes.length).toBeGreaterThan(0);
    expect(body.mediaPlayer).toBe('html5');
    expect(body.deviceInfo).toEqual({
      clientName: 'Auralis',
      clientVersion: '0.0.0',
      deviceId: 'auralis-recorder',
    });
  });

  it('every call sends the ABS key as a bearer token', async () => {
    const { fetch, sent } = fake({
      ...session,
      libraries: [],
      results: [],
      mediaType: 'book',
      media: {},
    });
    const abs = new AbsClient({ baseUrl: 'http://upstream.invalid', token: 'the-key', fetch });
    await abs.getLibraries();
    await abs.getLibraryItems('lib1', 1);
    await abs.getItem('li_1');
    await abs.play('li_1', { deviceId: 'd', clientVersion: '0' });
    await abs.closeSession('play_1');
    expect(sent).toHaveLength(5);
    for (const req of sent) expect(req.headers.get('authorization')).toBe('Bearer the-key');
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
});
