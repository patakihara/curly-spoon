import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsClient } from '../audiobookshelf/client.js';
import { createRecorder } from './record.js';
import { recordingSchema } from './recording.js';

const KEY = 'test-key-5e1f0c2a';
const LIBRARY = { id: 'lib1', name: 'Books', mediaType: 'book', displayOrder: 1 };

let server: Server;
let baseUrl: string;
let dir: string;
let seen: { headers: Record<string, unknown> }[];

beforeEach(async () => {
  seen = [];
  server = createServer((req, res) => {
    seen.push({ headers: req.headers });
    if (req.method === 'GET' && req.url === '/api/libraries') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': 'connect.sid=s%3Aabc; Path=/; HttpOnly',
        'x-powered-by': 'Express',
      });
      res.end(JSON.stringify({ libraries: [LIBRARY], token: KEY }));
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  dir = mkdtempSync(join(tmpdir(), 'auralis-record-'));
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

function recorder() {
  return createRecorder({
    fetch: globalThis.fetch,
    dir,
    upstream: 'audiobookshelf',
    upstreamVersion: '2.36.1',
    secrets: [KEY],
    baseUrl,
  });
}

describe('[M0.record/a] recording an adapter call', () => {
  it('[M0.record/a] an adapter in record mode writes the request and the response as a recording', async () => {
    const rec = recorder();
    const abs = new AbsClient({ baseUrl, token: KEY, fetch: rec.fetch });
    const libraries = await rec.capture('library-list', () => abs.getLibraries());
    expect(libraries.map((l) => l.name)).toEqual(['Books']);
    expect(seen).toHaveLength(1);

    expect(readdirSync(dir)).toEqual(['library-list.json']);
    const recording = recordingSchema.parse(
      JSON.parse(readFileSync(join(dir, 'library-list.json'), 'utf8')),
    );
    expect(recording.upstream).toBe('audiobookshelf');
    expect(recording.upstreamVersion).toBe('2.36.1');
    expect(recording.call).toBe('library-list');
    expect(recording.request.method).toBe('GET');
    expect(recording.request.path).toBe('/api/libraries');
    expect(recording.request.query).toEqual({});
    for (const name of Object.keys(recording.request.headers)) {
      expect(['accept', 'content-type', 'authorization']).toContain(name);
    }
    for (const name of Object.keys(recording.response.headers)) {
      expect(['accept', 'content-type', 'authorization']).toContain(name);
    }
    expect(recording.response.status).toBe(200);
    expect(recording.response.body).toEqual({
      json: { libraries: [LIBRARY], token: '<token>' },
    });
  });

  it('[M0.record/a] the recording carries no secret the fake upstream saw', async () => {
    const rec = recorder();
    const abs = new AbsClient({ baseUrl, token: KEY, fetch: rec.fetch });
    await rec.capture('library-list', () => abs.getLibraries());
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${KEY}`);

    const text = readFileSync(join(dir, 'library-list.json'), 'utf8');
    expect(text).not.toContain(KEY);
    expect(text).not.toContain('set-cookie');
    expect(text).not.toContain('connect.sid');
    expect(text).not.toContain(new URL(baseUrl).host);
    const recording = recordingSchema.parse(JSON.parse(text));
    expect(recording.request.headers.authorization).toBe('Bearer <token>');
  });

  it('[M0.record/a] the recorder writes the recording in a fixed, diffable form', async () => {
    const rec = recorder();
    const abs = new AbsClient({ baseUrl, token: KEY, fetch: rec.fetch });
    await rec.capture('library-list', () => abs.getLibraries());
    const text = readFileSync(join(dir, 'library-list.json'), 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(Object.keys(JSON.parse(text))).toEqual([
      'upstream',
      'upstreamVersion',
      'call',
      'request',
      'response',
    ]);
    expect(text).not.toContain('recordedAt');
  });

  it('[M0.record/a] a capture that makes no request, or two, fails and writes nothing', async () => {
    const rec = recorder();
    const abs = new AbsClient({ baseUrl, token: KEY, fetch: rec.fetch });
    await expect(rec.capture('none', async () => undefined)).rejects.toThrow(
      /none.*exactly one request.*0/,
    );
    await expect(
      rec.capture('two', async () => {
        await abs.getLibraries();
        await abs.getLibraries();
      }),
    ).rejects.toThrow(/two.*exactly one request.*2/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('[M0.record/a] a call made outside capture passes through unrecorded', async () => {
    const rec = recorder();
    const abs = new AbsClient({ baseUrl, token: KEY, fetch: rec.fetch });
    await abs.getLibraries();
    expect(seen).toHaveLength(1);
    expect(readdirSync(dir)).toEqual([]);
  });
});
