/**
 * A feed address a client named, read only from the public internet. No real name is looked up:
 * a stand-in lookup answers, and every connection goes to a local server whatever address it was
 * pinned to, so each test sees which addresses a hop was held to.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { feedFetch, type PinnedRequest, refusedFeedUrl } from './publicFetch.js';

const PUBLIC = '93.184.216.34';
const OTHER = '93.184.216.35';

describe('[M3.podcasts] a feed address a client named', () => {
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
    const hops: { url: string; pinned: unknown }[] = [];
    const request = ((url: URL, options: Record<string, unknown>, done: never) => {
      const lookup = options['lookup'] as (
        h: string,
        o: object,
        cb: (...a: unknown[]) => void,
      ) => void;
      lookup(url.hostname, { all: true }, (_: unknown, found: unknown) =>
        hops.push({ url: url.href, pinned: found }),
      );
      return httpRequest(
        {
          host: '127.0.0.1',
          port,
          path: url.pathname,
          method: 'GET',
          signal: options['signal'] as AbortSignal,
        },
        done,
      );
    }) as unknown as PinnedRequest;
    return { hops, request, requests: { 'http:': request, 'https:': request } };
  }

  it.each([
    'http://10.0.0.1/feed',
    'http://127.0.0.1/feed',
    'http://169.254.169.254/feed',
    'http://192.168.100.34:13378/feed',
    'http://100.64.0.1/feed',
    'http://192.0.2.1/feed',
    'http://198.51.100.1/feed',
    'http://203.0.113.1/feed',
    'http://[::1]/feed',
    'http://[fd00::1]/feed',
    'http://[fe80::1]/feed',
    'http://[fec0::1]/feed',
    'http://[::ffff:127.0.0.1]/feed',
    'http://[::127.0.0.1]/feed',
    'http://[::ffff:0:7f00:1]/feed',
    'http://[::ffff:ffff:7f00:1]/feed',
    'http://[::2:1]/feed',
    'http://[1::1]/feed',
    'http://[4000::1]/feed',
    'http://[64:ff9b::7f00:1]/feed',
    'http://[64:ff9b:1::1]/feed',
    'http://[100::1]/feed',
    'http://[2001::1]/feed',
    'http://[2001:db8::1]/feed',
    'http://[2002:7f00:1::1]/feed',
    'http://0x7f.1/feed',
    'http://2130706433/feed',
    'http://127.1/feed',
    'http://gluetun/feed',
    'http://nas.local/feed',
  ])('refuses %s from the address alone', (url) => {
    expect(refusedFeedUrl(new URL(url))).toBe('a private address');
  });

  it('allows a global unicast IPv6 address', () => {
    expect(refusedFeedUrl(new URL('http://[2606:4700::1111]/feed'))).toBeNull();
  });

  it('allows http and https on any port, and refuses another scheme or credentials', () => {
    expect(refusedFeedUrl(new URL('http://feeds.example:8080/a.rss'))).toBeNull();
    expect(refusedFeedUrl(new URL(`https://${PUBLIC}/a.rss`))).toBeNull();
    expect(refusedFeedUrl(new URL('ftp://feeds.example/a.rss'))).toBe('not http or https');
    expect(refusedFeedUrl(new URL('https://me:pw@feeds.example/a.rss'))).toBe('credentials');
    expect(refusedFeedUrl(new URL('https://me@feeds.example/a.rss'))).toBe('credentials');
  });

  it('[M3.podcasts/c] never connects to a name with one private address among public ones', async () => {
    const { hops, requests } = await upstream((_, res) => res.end('feed'));
    const fetch = feedFetch({ lookup: async () => [PUBLIC, '10.0.0.8'], requests });
    await expect(fetch('https://feeds.example/a.rss')).rejects.toThrow('a private address');
    expect(hops).toEqual([]);
  });

  it('[M3.podcasts/c] follows a redirect hop by hand and refuses one to a private address, never connecting to it', async () => {
    const { hops, requests } = await upstream((_, res) => {
      res.writeHead(302, { location: 'http://inside.example/feed' });
      res.end();
    });
    const lookup = async (host: string) => (host === 'inside.example' ? ['10.0.0.8'] : [PUBLIC]);
    const fetch = feedFetch({ lookup, requests });
    await expect(fetch('https://feeds.example/a.rss')).rejects.toThrow('a private address');
    expect(hops.map((h) => h.url)).toEqual(['https://feeds.example/a.rss']);
  });

  it('refuses a sixth redirect', async () => {
    const { hops, requests } = await upstream((req, res) => {
      res.writeHead(302, {
        location: `https://feeds.example/hop${Number(req.url!.slice(4) || 0) + 1}`,
      });
      res.end();
    });
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    await expect(fetch('https://feeds.example/hop0')).rejects.toThrow('too many redirects');
    expect(hops).toHaveLength(6);
  });

  it('follows https to http, and names the address after permanent redirects only', async () => {
    const { requests } = await upstream((req, res) => {
      if (req.url === '/a.rss') res.writeHead(301, { location: 'http://feeds.example/b.rss' });
      else if (req.url === '/b.rss') res.writeHead(302, { location: '/c.rss' });
      else res.writeHead(200, { 'content-type': 'application/rss+xml' });
      res.end(req.url === '/c.rss' ? 'the feed' : '');
    });
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    const { response, url } = await fetch('https://feeds.example/a.rss');
    expect(await response.text()).toBe('the feed');
    expect(url).toBe('http://feeds.example/b.rss');
  });

  it('refuses a redirect to an address carrying credentials', async () => {
    const { hops, requests } = await upstream((_, res) => {
      res.writeHead(301, { location: 'https://me:pw@feeds.example/b.rss' });
      res.end();
    });
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    await expect(fetch('https://feeds.example/a.rss')).rejects.toThrow('credentials');
    expect(hops).toHaveLength(1);
  });

  it('holds each connection to the first answer, however the name rebinds', async () => {
    const { hops, requests } = await upstream((_, res) => res.end('feed'));
    const answers = [[PUBLIC, OTHER], ['10.0.0.8']];
    let lookups = 0;
    const fetch = feedFetch({ lookup: async () => answers[lookups++] ?? [], requests });
    await (await fetch('https://feeds.example/a.rss')).response.text();
    expect(lookups).toBe(1);
    expect(hops[0]!.pinned).toEqual([
      { address: PUBLIC, family: 4 },
      { address: OTHER, family: 4 },
    ]);
  });

  it('refuses a name that does not exist as an unknown host, at once', async () => {
    const { hops, requests } = await upstream((_, res) => res.end('feed'));
    const missing = Object.assign(new Error('getaddrinfo ENOTFOUND feeds.exmaple'), {
      code: 'ENOTFOUND',
    });
    const fetch = feedFetch({ lookup: async () => Promise.reject(missing), requests });
    await expect(fetch('https://feeds.exmaple/a.rss')).rejects.toMatchObject({
      name: 'FeedRefused',
      message: 'an unknown host',
      privateAddress: false,
    });
    expect(hops).toEqual([]);
  });

  it('refuses a host that refuses the connection, at once', async () => {
    const { requests } = await upstream((_, res) => res.end('feed'));
    await new Promise((done) => server!.close(done));
    server = undefined;
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    await expect(fetch('https://feeds.example/a.rss')).rejects.toMatchObject({
      name: 'FeedRefused',
      message: 'the connection was refused',
      privateAddress: false,
    });
  });

  it('refuses a redirect to a malformed address, connecting no further', async () => {
    const { hops, requests } = await upstream((_, res) => {
      res.writeHead(302, { location: 'http://[not-an-address/b.rss' });
      res.end();
    });
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    await expect(fetch('https://feeds.example/a.rss')).rejects.toMatchObject({
      name: 'FeedRefused',
      message: 'a malformed redirect',
      privateAddress: false,
    });
    expect(hops).toHaveLength(1);
  });

  it('gives up when its signal does', async () => {
    const { requests } = await upstream(() => undefined);
    const fetch = feedFetch({ lookup: async () => [PUBLIC], requests });
    await expect(
      fetch('https://feeds.example/a.rss', { signal: AbortSignal.timeout(20) }),
    ).rejects.toThrow();
  });
});
