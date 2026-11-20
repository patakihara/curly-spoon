/**
 * An episode's audio read from its enclosure address, guarded as a feed is. No real name is looked
 * up: a stand-in lookup answers, and every connection goes to a local server whatever address it
 * was pinned to.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { enclosureFetch, FeedRefused, type PinnedRequest } from './publicFetch.js';

const PUBLIC = '93.184.216.34';

describe('[M3.stubs/c] an enclosure read', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise((done) => (server === undefined ? done(null) : server.close(done)));
    server = undefined;
  });

  /** A local server, and a `request` that reaches it whatever the hop, noting each hop. */
  async function upstream(answer: Parameters<typeof createServer>[1]) {
    server = createServer(answer);
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    const port = (server.address() as AddressInfo).port;
    const hops: string[] = [];
    const request = ((url: URL, options: Record<string, unknown>, done: never) => {
      hops.push(url.href);
      return httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: url.pathname,
          method: 'GET',
          headers: options['headers'] as Record<string, string>,
          signal: options['signal'] as AbortSignal,
        },
        done,
      );
    }) as unknown as PinnedRequest;
    return { hops, requests: { 'http:': request, 'https:': request } };
  }

  const lookup = async (host: string) => (host === 'private.example' ? ['10.0.0.5'] : [PUBLIC]);

  it('[M3.stubs/c] passes the reader’s Range on and its 206 and Content-Range back', async () => {
    const seen: (string | undefined)[] = [];
    const { requests } = await upstream((req, res) => {
      seen.push(req.headers.range);
      res.writeHead(206, { 'content-range': 'bytes 0-3/10', 'content-length': '4' });
      res.end('ID3x');
    });
    const response = await enclosureFetch({ lookup, requests })('https://cdn.example/ep.mp3', {
      range: 'bytes=0-3',
    });
    expect(seen).toEqual(['bytes=0-3']);
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-3/10');
    expect(await response.text()).toBe('ID3x');
  });

  it('[M3.stubs/c] streams a whole episode, larger than any feed cap, without buffering it', async () => {
    const chunk = Buffer.alloc(1024 * 1024, 7);
    const chunks = 40;
    const { requests } = await upstream((_req, res) => {
      res.writeHead(200, { 'content-length': String(chunk.length * chunks) });
      let sent = 0;
      const more = () => {
        while (sent < chunks) {
          sent++;
          if (!res.write(chunk)) return void res.once('drain', more);
        }
        res.end();
      };
      more();
    });
    const response = await enclosureFetch({ lookup, requests })('http://cdn.example/ep.mp3');
    expect(response.status).toBe(200);
    let total = 0;
    let reads = 0;
    for await (const piece of response.body as unknown as AsyncIterable<Uint8Array>) {
      total += piece.byteLength;
      reads++;
    }
    expect(total).toBe(chunk.length * chunks);
    expect(reads).toBeGreaterThan(1);
  });

  it('[M3.stubs/c] follows a redirect by hand and refuses a hop to a private address, never connecting to it', async () => {
    const { hops, requests } = await upstream((_req, res) => {
      res.writeHead(302, { location: 'http://private.example/ep.mp3' });
      res.end();
    });
    await expect(
      enclosureFetch({ lookup, requests })('https://tracker.example/ep.mp3'),
    ).rejects.toBeInstanceOf(FeedRefused);
    expect(hops).toEqual(['https://tracker.example/ep.mp3']);
  });
});
