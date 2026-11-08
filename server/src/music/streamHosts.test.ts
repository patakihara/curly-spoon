/**
 * Where a stream's host is looked up: once per host, its answer held and refreshed behind the
 * stream, and asked as soon as a song resolves, so a tap does not wait on DNS. No network: the
 * lookup is a fake.
 */
import { describe, expect, it } from 'vitest';
import { StreamUrl } from './schemas.js';
import { quickLookup, StreamHosts } from './streamHosts.js';

const A = ['142.250.1.1'];
const B = ['142.250.2.2'];

/** A lookup that answers only when told, and says what it was asked. */
function held() {
  const asked: string[] = [];
  const waiting: { host: string; answer: (a: string[]) => void; fail: (e: Error) => void }[] = [];
  const lookup = (host: string) =>
    new Promise<string[]>((answer, fail) => {
      asked.push(host);
      waiting.push({ host, answer, fail });
    });
  return { asked, waiting, lookup };
}

const settled = () => new Promise((resolve) => setImmediate(resolve));

describe('StreamHosts', () => {
  it('[M3.ytmusic/a] two asks for one host share one lookup', async () => {
    const dns = held();
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => 0 });
    const both = Promise.all([hosts.lookup('rr1.example.com'), hosts.lookup('rr1.example.com')]);
    dns.waiting[0]?.answer(A);
    expect(await both).toEqual([A, A]);
    expect(dns.asked).toEqual(['rr1.example.com']);
  });

  it('[M3.ytmusic/a] a held answer is used at once, and refreshed behind it once it is old', async () => {
    const dns = held();
    let now = 0;
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => now, refreshAfterMs: 60_000 });
    const first = hosts.lookup('rr1.example.com');
    dns.waiting[0]?.answer(A);
    await first;
    now = 30_000;
    expect(await hosts.lookup('rr1.example.com')).toEqual(A);
    expect(dns.asked).toHaveLength(1);
    now = 61_000;
    expect(await hosts.lookup('rr1.example.com')).toEqual(A);
    expect(await hosts.lookup('rr1.example.com')).toEqual(A);
    expect(dns.asked).toHaveLength(2);
    dns.waiting[1]?.answer(B);
    await settled();
    expect(await hosts.lookup('rr1.example.com')).toEqual(B);
  });

  it('[M3.ytmusic/a] a refresh that fails keeps the held answer', async () => {
    const dns = held();
    let now = 0;
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => now, refreshAfterMs: 60_000 });
    const first = hosts.lookup('rr1.example.com');
    dns.waiting[0]?.answer(A);
    await first;
    now = 61_000;
    await hosts.lookup('rr1.example.com');
    dns.waiting[1]?.fail(new Error('ETIMEOUT'));
    await settled();
    expect(await hosts.lookup('rr1.example.com')).toEqual(A);
  });

  it('[M3.ytmusic/a] an answer past its keeping is looked up again before use', async () => {
    const dns = held();
    let now = 0;
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => now, keepMs: 3_600_000 });
    const first = hosts.lookup('rr1.example.com');
    dns.waiting[0]?.answer(A);
    await first;
    now = 3_600_001;
    const again = hosts.lookup('rr1.example.com');
    dns.waiting[1]?.answer(B);
    expect(await again).toEqual(B);
  });

  it('[M3.ytmusic/a] a first lookup that fails is not held, and the next ask tries again', async () => {
    const dns = held();
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => 0 });
    const first = hosts.lookup('rr1.example.com');
    dns.waiting[0]?.fail(new Error('ENOTFOUND'));
    await expect(first).rejects.toThrow('ENOTFOUND');
    const again = hosts.lookup('rr1.example.com');
    dns.waiting[1]?.answer(A);
    expect(await again).toEqual(A);
  });

  it('[M3.ytmusic/a] warming a host looks it up once, ahead of its first fetch, and never throws', async () => {
    const dns = held();
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => 0 });
    hosts.warm(new StreamUrl('https://rr1.example.com/videoplayback?id=1'));
    hosts.warm(new StreamUrl('https://rr1.example.com/videoplayback?id=2'));
    hosts.warm(new StreamUrl('not a url'));
    expect(dns.asked).toEqual(['rr1.example.com']);
    const fetched = hosts.lookup('rr1.example.com');
    dns.waiting[0]?.answer(A);
    expect(await fetched).toEqual(A);
    expect(dns.asked).toHaveLength(1);
    hosts.warm(new StreamUrl('https://rr2.example.com/videoplayback'));
    dns.waiting[1]?.fail(new Error('ETIMEOUT'));
    await settled();
  });

  it('[M3.ytmusic/a] hosts are kept apart', async () => {
    const dns = held();
    const hosts = new StreamHosts({ lookup: dns.lookup, now: () => 0 });
    const one = hosts.lookup('rr1.example.com');
    const two = hosts.lookup('rr2.example.com');
    dns.waiting[0]?.answer(A);
    dns.waiting[1]?.answer(B);
    expect([await one, await two]).toEqual([A, B]);
  });
});

describe('quickLookup', () => {
  it('[M3.ytmusic/a] asks IPv4 addresses with a short resend, and the system lookup when that fails', async () => {
    const quick = quickLookup({
      resolve4: async (host) =>
        host === 'v4.example.com' ? A : Promise.reject(new Error('ENODATA')),
      lookupAll: async () => B,
    });
    expect(await quick('v4.example.com')).toEqual(A);
    expect(await quick('v6only.example.com')).toEqual(B);
  });

  it('[M3.ytmusic/a] an empty IPv4 answer falls to the system lookup too', async () => {
    const quick = quickLookup({ resolve4: async () => [], lookupAll: async () => B });
    expect(await quick('v6only.example.com')).toEqual(B);
  });
});
