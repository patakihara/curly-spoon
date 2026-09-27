/**
 * Scrub and scan together, over every leak an adversarial fuzz of the recorder found. The
 * scan is the backstop: whatever the scrubber misses, the scan must flag. All data here is
 * synthetic.
 */
import { describe, expect, it } from 'vitest';
import { type FindingKind, scanRecording } from './scan.js';
import { type RawExchange, scrub } from './scrub.js';

const SECRET = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJyb290In0.sigSIGsig';
const BASE = 'http://100.64.12.34:13378';
const OPAQUE = 'deadbeefcafe1234';

interface Parts {
  url?: string;
  reqH?: Record<string, string>;
  resH?: Record<string, string>;
  json?: unknown;
  text?: string;
  reqJson?: unknown;
}

function ex(o: Parts): RawExchange {
  return {
    upstream: 'audiobookshelf',
    upstreamVersion: '2.36.1',
    call: 'c',
    request: {
      method: 'GET',
      url: o.url ?? `${BASE}/api/items/x`,
      headers: o.reqH ?? {},
      body: o.reqJson !== undefined ? { json: o.reqJson } : null,
    },
    response: {
      status: 200,
      headers: o.resH ?? { 'content-type': 'application/json' },
      body: o.text !== undefined ? { text: o.text } : { json: o.json ?? {} },
    },
  };
}

const b64 = Buffer.from(OPAQUE).toString('base64');

/** [name, raw call, what must not survive, how it ends: scrubbed or the scan's finding]. */
const cases: [string, RawExchange, string[], 'scrubbed' | FindingKind][] = [
  ['a bearer header', ex({ reqH: { Authorization: `Bearer ${SECRET}` } }), [SECRET], 'scrubbed'],
  [
    'a bearer token the recorder was not given',
    ex({ reqH: { Authorization: 'Bearer abcdef0123456789abcdef' } }),
    ['abcdef0123456789'],
    'scrubbed',
  ],
  [
    'a quoted MediaBrowser token',
    ex({ reqH: { Authorization: `MediaBrowser Client="A", Token="${OPAQUE}"` } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'an unquoted MediaBrowser token',
    ex({ reqH: { Authorization: `MediaBrowser Client="A", Token=${OPAQUE}` } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'a lowercase MediaBrowser token',
    ex({ reqH: { Authorization: `MediaBrowser Client="A", token="${OPAQUE}"` } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'an Emby token',
    ex({ reqH: { Authorization: `Emby Client="A", Token=${OPAQUE}` } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'a Basic header',
    ex({ reqH: { Authorization: 'Basic dXNlcjpwYXNz' } }),
    ['dXNlcjpwYXNz'],
    'scrubbed',
  ],
  [
    'an X-Emby-Authorization header',
    ex({ reqH: { 'X-Emby-Authorization': `MediaBrowser Token="${OPAQUE}"` } }),
    [OPAQUE],
    'scrubbed',
  ],
  ['an X-Emby-Token header', ex({ reqH: { 'X-Emby-Token': OPAQUE } }), [OPAQUE], 'scrubbed'],
  [
    'a set-cookie header',
    ex({ resH: { 'content-type': 'application/json', 'set-cookie': 'connect.sid=s%3Aabc' } }),
    ['connect.sid'],
    'scrubbed',
  ],
  ['an api_key query', ex({ url: `${BASE}/Items?api_key=${OPAQUE}` }), [OPAQUE], 'scrubbed'],
  ['a token query', ex({ url: `${BASE}/x?token=${OPAQUE}` }), [OPAQUE], 'scrubbed'],
  ['an X-Emby-Token query', ex({ url: `${BASE}/x?X-Emby-Token=${OPAQUE}` }), [OPAQUE], 'scrubbed'],
  ['an accessToken query', ex({ url: `${BASE}/x?accessToken=${OPAQUE}` }), [OPAQUE], 'scrubbed'],
  [
    'token fields in the body',
    ex({
      json: { user: { token: OPAQUE, accessToken: 'aaaaaaaaaaaa1111', refreshToken: 'bbbb2222' } },
    }),
    [OPAQUE, 'aaaaaaaaaaaa1111', 'bbbb2222'],
    'scrubbed',
  ],
  [
    'tokens in a nested array',
    ex({ json: { sessions: [{ tokens: [OPAQUE] }] } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'a key in a URL inside the body',
    ex({ json: { streamUrl: `/Audio/x/stream?api_key=${OPAQUE}` } }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'an X-Emby-Token and an accessToken in a URL inside the body',
    ex({
      json: {
        a: `/x?X-Emby-Token=${OPAQUE}`,
        b: `http://upstream.invalid/y?z=1&accessToken=${OPAQUE}`,
      },
    }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'an absolute URL on the bare host name',
    ex({ json: { url: 'http://mediaserver:8096/x' } }),
    ['mediaserver'],
    'scrubbed',
  ],
  ['a base64 token in a URL', ex({ json: { u: `/x?t=${b64}` } }), [b64], 'query-secret'],
  ['a Tailscale IPv4', ex({ json: { addr: '100.64.0.5' } }), ['100.64.0.5'], 'scrubbed'],
  ['a LAN IPv4', ex({ json: { addr: '192.168.1.20' } }), ['192.168.1.20'], 'scrubbed'],
  [
    'an IPv4 under a version-like key',
    ex({ json: { serverVersionHost: '192.168.1.20' } }),
    ['192.168.1.20'],
    'scrubbed',
  ],
  ['a Tailscale IPv6', ex({ json: { addr: 'fd7a:115c:a1e0::1234' } }), ['fd7a:115c'], 'scrubbed'],
  ['a global IPv6', ex({ json: { seen: 'from 2a01:4f8::7 today' } }), ['2a01:4f8'], 'scrubbed'],
  ['the bare host name', ex({ json: { serverName: 'mediaserver' } }), ['mediaserver'], 'scrubbed'],
  [
    'a hostname-shaped value in a host field',
    ex({ json: { ServerName: 'nas-box', LocalAddress: 'jukebox:8096' } }),
    ['nas-box', 'jukebox'],
    'scrubbed',
  ],
  ['a tailnet host', ex({ json: { h: 'box.tail0000.ts.net' } }), ['tail0000'], 'scrubbed'],
  [
    'a tailnet host in a URL',
    ex({ json: { h: 'https://box.tail0000.ts.net/x' } }),
    ['tail0000'],
    'scrubbed',
  ],
  ['a bare host on a country domain', ex({ json: { h: 'files.example.fi' } }), [], 'host'],
  ['an email', ex({ json: { e: 'alice@example.org' } }), ['example.org'], 'scrubbed'],
  ['an email without a dotted domain', ex({ json: { e: 'alice@box' } }), ['alice@'], 'scrubbed'],
  [
    'a home path',
    ex({ json: { path: '/home/alice/audiobooks/x.m4b', mac: '/Users/alice/x' } }),
    ['alice'],
    'scrubbed',
  ],
  [
    'a URL-encoded home path in the request path',
    ex({ url: `${BASE}/api/x/%2Fhome%2Falice` }),
    ['alice'],
    'scrubbed',
  ],
  [
    'a token in an HLS playlist',
    ex({
      resH: { 'content-type': 'application/vnd.apple.mpegurl' },
      text: `#EXTM3U\nseg0.ts?token=${OPAQUE}\n`,
    }),
    [OPAQUE],
    'scrubbed',
  ],
  [
    'a password in the request body',
    ex({ reqJson: { username: 'root', password: 'hunter22' } }),
    ['hunter22'],
    'scrubbed',
  ],
  ['a hex key under "key"', ex({ json: { key: `${OPAQUE}${OPAQUE}` } }), [OPAQUE], 'scrubbed'],
  ['a secret under "pass"', ex({ json: { pass: 'hunter22' } }), ['hunter22'], 'scrubbed'],
  [
    'a numeric token',
    ex({ json: { token: 12345678, secret: 42 } }),
    ['12345678', '42'],
    'scrubbed',
  ],
];

describe('[M0.record/c] every known leak ends scrubbed or flagged', () => {
  for (const [name, raw, needles, ending] of cases) {
    it(`[M0.record/c] ${name}: ${ending === 'scrubbed' ? 'scrubbed' : `flagged as ${ending}`}`, () => {
      const recording = scrub(raw, { secrets: [SECRET], baseUrl: BASE });
      const text = JSON.stringify(recording);
      const findings = scanRecording(recording);
      if (ending === 'scrubbed') {
        for (const needle of needles) expect(text).not.toContain(needle);
        expect(findings).toEqual([]);
      } else {
        expect(findings.map((f) => f.kind)).toContain(ending);
      }
    });
  }
});

describe('[M0.record/c] scrubbing keeps what the adapter tests need', () => {
  it('[M0.record/c] ids, titles, durations, mime types, versions and media paths stay', () => {
    const json = {
      id: 'play_0f1e2d3c',
      libraryItemId: '4a5b6c7d-0000-4000-8000-000000000001',
      displayTitle: 'A Book, Part 2.1',
      duration: 12345.678,
      serverVersion: '2.36.1',
      Version: '10.11.11',
      audioTracks: [{ mimeType: 'audio/mp4', contentUrl: '/api/items/4a5b/file/123' }],
      Path: '/data/media/Books/A Book/01.m4b',
      coverPath: '/audiobooks/A Book/cover.jpg',
      clock: '12:30:00',
    };
    const r = scrub(ex({ json }), { secrets: [SECRET], baseUrl: BASE });
    expect(r.response.body).toEqual({ json });
    expect(scanRecording(r)).toEqual([]);
  });

  it('[M0.record/c] placeholders are stable: scrubbing a scrubbed recording changes nothing', () => {
    for (const [, raw] of cases) {
      const once = scrub(raw, { secrets: [SECRET], baseUrl: BASE });
      const again = scrub(
        {
          upstream: once.upstream,
          upstreamVersion: once.upstreamVersion,
          call: once.call,
          request: {
            method: once.request.method,
            url: `http://upstream.invalid${once.request.path}?${new URLSearchParams(once.request.query).toString()}`,
            headers: once.request.headers,
            body: once.request.body,
          },
          response: once.response,
        },
        { secrets: [SECRET], baseUrl: BASE },
      );
      expect(again).toEqual(once);
    }
  });
});
