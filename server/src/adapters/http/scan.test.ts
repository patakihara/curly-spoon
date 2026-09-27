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
    upstreamVersion: '23.0.0.0',
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
          Version: '23.0.0.0',
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

  it('[M0.record/c] a clean recording has no findings, and a version like 23.0.0.0 is not an IP', () => {
    expect(scanRecording(clean())).toEqual([]);
  });
});
