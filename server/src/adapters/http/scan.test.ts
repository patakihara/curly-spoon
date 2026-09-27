import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type Recording, recordingSchema } from './recording.js';
import { type Finding, scanRecording } from './scan.js';

const adapters = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every committed recording, as [file relative to adapters/, parsed JSON]. */
function committedRecordings(): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const upstream of readdirSync(adapters, { withFileTypes: true })) {
    if (!upstream.isDirectory()) continue;
    const dir = join(adapters, upstream.name, 'recordings');
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const f of files) {
      out.push([
        `${upstream.name}/recordings/${f}`,
        JSON.parse(readFileSync(join(dir, f), 'utf8')),
      ]);
    }
  }
  return out;
}

function clean(): Recording {
  return {
    upstream: 'jellyfin',
    upstreamVersion: '10.11.11',
    call: 'item-detail',
    request: {
      method: 'GET',
      path: '/Items/abc',
      query: {},
      headers: {
        accept: 'application/json',
        authorization:
          'MediaBrowser Client="Auralis", Device="d", DeviceId="i", Version="0", Token="<token>"',
      },
      body: null,
    },
    response: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        json: {
          Name: 'An Album',
          Version: '10.11.11',
          ServerVersion: '2.36.1',
          Path: '/data/media/Music/An Album',
          Link: 'http://upstream.invalid/Items/abc',
          AccessToken: '<token>',
          IsTokenSet: true,
        },
      },
    },
  };
}

/** Deep-copies the clean recording and applies one leak to it. */
function leak(apply: (r: Recording) => void): Recording {
  const r = structuredClone(clean());
  apply(r);
  return r;
}

function body(r: Recording): Record<string, unknown> {
  return (r.response.body as { json: Record<string, unknown> }).json;
}

describe('[M0.record/c] scanning recordings for leaks', () => {
  it('[M0.record/c] every committed recording is free of tokens, keys, cookies, passwords and real hosts', () => {
    const problems: string[] = [];
    for (const [file, json] of committedRecordings()) {
      const parsed = recordingSchema.safeParse(json);
      if (!parsed.success) {
        problems.push(`${file}: not a recording (${parsed.error.message})`);
        continue;
      }
      for (const f of scanRecording(parsed.data)) problems.push(`${file}: ${f.kind} at ${f.path}`);
    }
    expect(problems).toEqual([]);
  });

  it('[M0.record/c] the scan catches each kind of leak', () => {
    const cases: [string, Recording, Finding][] = [
      [
        'a JWT',
        leak((r) => {
          body(r).Overview = 'eyJhbGciOiJIUzI1NiJ9.eyJrZXlJZCI6IjEifQ.c2lnbmF0dXJl';
        }),
        { kind: 'jwt', path: '$.response.body.json.Overview' },
      ],
      [
        'a token field',
        leak((r) => {
          body(r).accessToken = 'abc';
        }),
        { kind: 'secret-field', path: '$.response.body.json.accessToken' },
      ],
      [
        'a key in the query',
        leak((r) => {
          r.request.query.ApiKey = 'abc';
        }),
        { kind: 'query-secret', path: '$.request.query.ApiKey' },
      ],
      [
        'a set-cookie header',
        leak((r) => {
          r.response.headers['set-cookie'] = 'sid=1';
        }),
        { kind: 'cookie', path: '$.response.headers.set-cookie' },
      ],
      [
        'a MediaBrowser token',
        leak((r) => {
          r.request.headers.authorization = 'MediaBrowser Client="Auralis", Token="abc"';
        }),
        { kind: 'secret-field', path: '$.request.headers.authorization' },
      ],
      [
        'a private IP',
        leak((r) => {
          body(r).Server = '10.1.2.3';
        }),
        { kind: 'ip', path: '$.response.body.json.Server' },
      ],
      [
        'a real host',
        leak((r) => {
          body(r).Link = 'http://media.example.net/';
        }),
        { kind: 'host', path: '$.response.body.json.Link' },
      ],
      [
        'an email',
        leak((r) => {
          body(r).Contact = 'someone@example.org';
        }),
        { kind: 'email', path: '$.response.body.json.Contact' },
      ],
    ];
    for (const [name, recording, finding] of cases) {
      expect(scanRecording(recording), name).toEqual([finding]);
    }
  });

  it('[M0.record/c] the scan catches what the scrubber could miss', () => {
    const cases: [string, Recording, Finding][] = [
      [
        'an unquoted MediaBrowser token',
        leak((r) => {
          r.request.headers.authorization = 'MediaBrowser Client="Auralis", Token=abc';
        }),
        { kind: 'secret-field', path: '$.request.headers.authorization' },
      ],
      [
        'a lowercase MediaBrowser token',
        leak((r) => {
          r.request.headers.authorization = 'MediaBrowser Client="Auralis", token="abc"';
        }),
        { kind: 'secret-field', path: '$.request.headers.authorization' },
      ],
      [
        'an authorization header it cannot parse',
        leak((r) => {
          r.request.headers.authorization = 'MediaBrowser Client="Auralis" Token="<token>" x';
        }),
        { kind: 'secret-field', path: '$.request.headers.authorization' },
      ],
      [
        'a token-named header',
        leak((r) => {
          r.request.headers['x-emby-token'] = 'abc';
        }),
        { kind: 'secret-field', path: '$.request.headers.x-emby-token' },
      ],
      [
        'an X-Emby-Token query key',
        leak((r) => {
          r.request.query['X-Emby-Token'] = 'abc';
        }),
        { kind: 'query-secret', path: '$.request.query.X-Emby-Token' },
      ],
      [
        'an accessToken in a URL inside the body',
        leak((r) => {
          body(r).Link = 'http://upstream.invalid/Items/abc?accessToken=abc';
        }),
        { kind: 'query-secret', path: '$.response.body.json.Link' },
      ],
      [
        'a token in a text body',
        leak((r) => {
          r.response.body = { text: '#EXTM3U\nseg0.ts?token=abc\n' };
        }),
        { kind: 'query-secret', path: '$.response.body.text' },
      ],
      [
        'an IPv6 address',
        leak((r) => {
          body(r).Server = 'fd7a:115c:a1e0::1';
        }),
        { kind: 'ip', path: '$.response.body.json.Server' },
      ],
      [
        'an IPv4-mapped IPv6 address',
        leak((r) => {
          body(r).Server = '::ffff:100.101.102.103';
        }),
        { kind: 'ip', path: '$.response.body.json.Server' },
      ],
      [
        'an IPv6 address with an embedded IPv4 tail',
        leak((r) => {
          body(r).Server = '64:ff9b::192.0.2.1';
        }),
        { kind: 'ip', path: '$.response.body.json.Server' },
      ],
      [
        'an IPv4 under a version key',
        leak((r) => {
          body(r).Version = '10.1.2.3';
        }),
        { kind: 'ip', path: '$.response.body.json.Version' },
      ],
      [
        'the bare host name',
        leak((r) => {
          body(r).Name = 'Served by mediaserver';
        }),
        { kind: 'host', path: '$.response.body.json.Name' },
      ],
      [
        'a hostname in a host field',
        leak((r) => {
          body(r).ServerName = 'nas-box';
        }),
        { kind: 'host', path: '$.response.body.json.ServerName' },
      ],
      [
        'an email without a dotted domain',
        leak((r) => {
          body(r).Contact = 'someone@box';
        }),
        { kind: 'email', path: '$.response.body.json.Contact' },
      ],
      [
        'a home folder',
        leak((r) => {
          body(r).Path = '/home/someone/Music/An Album';
        }),
        { kind: 'home-path', path: '$.response.body.json.Path' },
      ],
      [
        'a key under "key"',
        leak((r) => {
          body(r).key = 'abc';
        }),
        { kind: 'secret-field', path: '$.response.body.json.key' },
      ],
      [
        'a numeric secret',
        leak((r) => {
          body(r).password = 1234;
        }),
        { kind: 'secret-field', path: '$.response.body.json.password' },
      ],
      [
        'a Basic header with its credentials',
        leak((r) => {
          r.request.headers.authorization = 'Basic dXNlcjpwYXNz';
        }),
        { kind: 'secret-field', path: '$.request.headers.authorization' },
      ],
    ];
    for (const [name, recording, finding] of cases) {
      expect(scanRecording(recording), name).toEqual([finding]);
    }
  });

  it('[M0.record/c] a clean recording has no findings, and versions like 2.36.1 or 10.11.11 are not IPs', () => {
    expect(scanRecording(clean())).toEqual([]);
  });

  it('[M0.record/c] the scrubbed placeholders pass the scan', () => {
    expect(
      scanRecording(
        leak((r) => {
          body(r).ipAddress = '::ffff:192.0.2.1';
        }),
      ),
      'a mapped placeholder address',
    ).toEqual([]);
    for (const authorization of ['<token>', 'Basic <token>', 'Bearer <token>']) {
      expect(
        scanRecording(
          leak((r) => {
            r.request.headers.authorization = authorization;
          }),
        ),
        authorization,
      ).toEqual([]);
    }
  });
});
