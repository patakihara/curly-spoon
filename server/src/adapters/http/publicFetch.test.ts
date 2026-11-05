/**
 * A fetch that reaches only the public internet, at the address it checked. No real name is looked
 * up here: a test's answer stands in, and the one socket any test opens is a local server's.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import {
  pinnedGet,
  publicFetch,
  type PinnedRequest,
  readCapped,
  refusedUrl,
} from './publicFetch.js';

const PUBLIC = '93.184.216.34';

/** The request's options as `https.request` would be given them, answering nothing. */
function capturing() {
  const asked: { url: URL; lookup: (...args: unknown[]) => void }[] = [];
  const request = ((url: URL, options: { lookup: (...args: unknown[]) => void }) => {
    asked.push({ url, lookup: options.lookup });
    return { on: () => undefined, end: () => undefined };
  }) as unknown as PinnedRequest;
  return { asked, request };
}

describe('[M3.books] a fetch of a public address', () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise((done) => (server === undefined ? done(null) : server.close(done)));
    server = undefined;
  });
  const listening = async (answer: Parameters<typeof createServer>[1]) => {
    server = createServer(answer);
    await new Promise<void>((done) => server?.listen(0, '127.0.0.1', done));
    return (server.address() as AddressInfo).port;
  };

  it.each([
    ['http://images.example/a.jpg', 'not https'],
    ['https://10.0.0.1/a.jpg', 'a private address'],
    ['https://[::1]/a.jpg', 'a private address'],
    ['https://gluetun/a.jpg', 'a private address'],
    ['https://nas.local/a.jpg', 'a private address'],
    ['https://images.example/a.jpg', null],
    [`https://${PUBLIC}/a.jpg`, null],
  ])('%s: %s', (url, why) => {
    expect(refusedUrl(new URL(url))).toBe(why);
  });

  it('never asks a name that resolves to a private address, even among public ones', async () => {
    const { asked, request } = capturing();
    const fetch = publicFetch({ lookup: async () => [PUBLIC, '10.0.0.8'], request });
    await expect(fetch('https://images.example/a.jpg')).rejects.toThrow('a private address');
    expect(asked).toEqual([]);
  });

  it('never asks a name that resolves to nothing', async () => {
    const { asked, request } = capturing();
    const fetch = publicFetch({ lookup: async () => [], request });
    await expect(fetch('https://images.example/a.jpg')).rejects.toThrow('a private address');
    expect(asked).toEqual([]);
  });

  it('looks the name up once, and the connection is held to that answer however the name rebinds', async () => {
    const { asked, request } = capturing();
    const answers = [[PUBLIC], ['10.0.0.8']];
    let lookups = 0;
    const fetch = publicFetch({
      lookup: async () => answers[lookups++] ?? [],
      request,
    });
    void fetch('https://images.example/a.jpg');
    await new Promise((done) => setImmediate(done));
    expect(lookups).toBe(1);
    const held = asked[0]!.lookup;
    const one = await new Promise((done) =>
      held('images.example', { all: false }, (_: unknown, address: string) => done(address)),
    );
    const all = await new Promise((done) =>
      held('images.example', { all: true }, (_: unknown, found: unknown) => done(found)),
    );
    expect(one).toBe(PUBLIC);
    expect(all).toEqual([{ address: PUBLIC, family: 4 }]);
    expect(lookups).toBe(1);
  });

  it('connects to the address it was given, not to whatever the name says', async () => {
    const port = await listening((_, res) => res.end('the bytes'));
    const response = await pinnedGet(
      new URL(`http://name-nothing-resolves.invalid:${port}/a.jpg`),
      ['127.0.0.1'],
      undefined,
      httpRequest as unknown as PinnedRequest,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('the bytes');
  });

  it('never follows a redirect', async () => {
    const port = await listening((_, res) => {
      res.writeHead(302, { location: 'http://127.0.0.1:1/inside' });
      res.end();
    });
    const response = await pinnedGet(
      new URL(`http://images.invalid:${port}/a.jpg`),
      ['127.0.0.1'],
      undefined,
      httpRequest as unknown as PinnedRequest,
    );
    expect(response.status).toBe(302);
  });

  it('gives up when its signal does', async () => {
    const port = await listening(() => undefined);
    await expect(
      pinnedGet(
        new URL(`http://images.invalid:${port}/a.jpg`),
        ['127.0.0.1'],
        { signal: AbortSignal.timeout(20) },
        httpRequest as unknown as PinnedRequest,
      ),
    ).rejects.toThrow();
  });

  it('reads no further than the cap', async () => {
    expect(await readCapped(new Response(new Uint8Array(10)), 20)).toHaveLength(10);
    expect(await readCapped(new Response(new Uint8Array(30)), 20)).toBeNull();
  });
});
