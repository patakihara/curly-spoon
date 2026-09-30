/**
 * The recorded-upstreams server, driven the way the emulator's smoke test drives it: an Android
 * sign-in through the stand-in sign-on, the code swapped for a bearer, then a plan and a range
 * request on its track. Everything answers from the committed recordings, in-process.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type PlaybackPlan } from '@auralis/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { type RecordedServer, recordedServer } from './recorded.js';

const tone = readFileSync(
  fileURLToPath(
    new URL('../src/adapters/audiobookshelf/recordings/item-file.m4a', import.meta.url),
  ),
);

let servers: RecordedServer[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

async function boot(options: Parameters<typeof recordedServer>[0] = {}) {
  const server = await recordedServer({ logger: false, ...options });
  servers.push(server);
  return server;
}

const path = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

/** An Android sign-in, as the app starts it and a browser follows it; the app's redirect back. */
async function androidSignIn(server: RecordedServer) {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const login = await server.app.inject({
    url: `/api/auth/login?client=android&code_challenge=${challenge}&device_id=emulator`,
  });
  expect(login.statusCode, login.body).toBe(302);
  const authorize = String(login.headers.location);
  const back = server.signOn.authorize(authorize);
  const callback = await server.app.inject({ url: path(back) });
  return { verifier, authorize, back, callback };
}

async function bearerFor(server: RecordedServer) {
  const { verifier, callback } = await androidSignIn(server);
  const code = new URL(String(callback.headers.location)).searchParams.get('code') ?? '';
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/auth/token',
    payload: { code, codeVerifier: verifier },
  });
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ token: string }>().token;
}

describe('the recorded-upstreams server', () => {
  it('boots and answers its health check', async () => {
    const server = await boot();
    const res = await server.app.inject({ url: '/api/health' });
    expect(res.json()).toEqual({ status: 'ok', commit: null });
  });

  it('sends an Android sign-in to the stand-in sign-on, which returns it to the app with a code and the same state', async () => {
    const server = await boot({ address: '10.0.2.2', port: 8787, signOnPort: 8788 });
    const { authorize, back, callback } = await androidSignIn(server);
    expect(authorize.startsWith('http://10.0.2.2:8788/authorize?')).toBe(true);
    const sent = new URL(authorize).searchParams;
    const returned = new URL(back);
    expect(`${returned.origin}${returned.pathname}`).toBe('http://10.0.2.2:8787/api/auth/callback');
    expect(returned.searchParams.get('state')).toBe(sent.get('state'));
    expect(callback.statusCode, callback.body).toBe(302);
    expect(String(callback.headers.location)).toMatch(/^auralis:\/\/auth\/callback\?code=[\w-]+$/);
  });

  it('swaps the callback code for a bearer that is the recorded identity', async () => {
    const server = await boot();
    const token = await bearerFor(server);
    const me = await server.app.inject({
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ username: server.user.username });
  });

  it('signs in more than once in one boot', async () => {
    const server = await boot();
    await bearerFor(server);
    await bearerFor(server);
  });

  it('plans the recorded item, and its track answers a range request with 206 audio', async () => {
    const server = await boot();
    const headers = { authorization: `Bearer ${await bearerFor(server)}` };
    const planned = await server.app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref: server.playable },
    });
    expect(planned.statusCode, planned.body).toBe(200);
    const [track] = planned.json<PlaybackPlan>().tracks;
    expect(track).toBeDefined();

    const res = await server.app.inject({
      url: track!.url,
      headers: { ...headers, range: 'bytes=0-99' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-type']).toBe('audio/mp4');
    expect(res.headers['content-range']).toBe(`bytes 0-99/${tone.byteLength}`);
    expect(res.rawPayload).toEqual(tone.subarray(0, 100));
  });

  it('plans the recorded four-file book as four tracks, each answering a range request with 206', async () => {
    const server = await boot();
    const headers = { authorization: `Bearer ${await bearerFor(server)}` };
    const planned = await server.app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref: server.multiFile },
    });
    expect(planned.statusCode, planned.body).toBe(200);
    const { tracks, chapters } = planned.json<PlaybackPlan>();
    expect(tracks).toHaveLength(4);
    expect(chapters).toHaveLength(4);
    for (const track of tracks) {
      const res = await server.app.inject({
        url: track.url,
        headers: { ...headers, range: 'bytes=0-9' },
      });
      expect(res.statusCode, track.url).toBe(206);
      expect(res.headers['content-type']).toBe('audio/mpeg');
    }
  });

  it('times the four-file book by its 5 s stand-in tones, so its tracks and chapters meet end to end', async () => {
    const server = await boot();
    const headers = { authorization: `Bearer ${await bearerFor(server)}` };
    const planned = await server.app.inject({
      method: 'POST',
      url: '/api/play',
      headers,
      payload: { ref: server.multiFile },
    });
    const { tracks, chapters } = planned.json<PlaybackPlan>();
    let offset = 0;
    tracks.forEach((track, i) => {
      expect(track.duration).toBeCloseTo(5, 1);
      expect(track.offset).toBeCloseTo(offset, 6);
      expect(chapters[i]!.start).toBeCloseTo(track.offset, 6);
      expect(chapters[i]!.end).toBeCloseTo(track.offset + track.duration, 6);
      offset += track.duration;
    });
    // The titles are the recording's own.
    expect(chapters[1]!.title).toBe('Ars Lunga');
  });

  it('refuses a callback whose state is not the sign-in it started', async () => {
    const server = await boot();
    const login = await server.app.inject({
      url: `/api/auth/login?client=android&code_challenge=${'a'.repeat(43)}`,
    });
    const back = new URL(server.signOn.authorize(String(login.headers.location)));
    back.searchParams.set('state', randomBytes(24).toString('base64url'));
    const callback = await server.app.inject({ url: path(back.toString()) });
    expect(callback.statusCode).toBe(400);
    expect(callback.json()).toEqual({ error: 'bad_state' });
  });

  it('refuses a sign-in whose ID token carries another nonce than the one the app sent', async () => {
    const server = await boot();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const login = await server.app.inject({
      url: `/api/auth/login?client=android&code_challenge=${challenge}`,
    });
    const authorize = new URL(String(login.headers.location));
    authorize.searchParams.set('nonce', randomBytes(24).toString('base64url'));
    const callback = await server.app.inject({
      url: path(server.signOn.authorize(authorize.toString())),
    });
    expect(callback.statusCode).toBe(400);
    expect(callback.json()).toEqual({ error: 'bad_token' });
  });

  it('refuses at the stand-in sign-on a sign-in sent back anywhere but the app', async () => {
    const server = await boot();
    const login = await server.app.inject({
      url: `/api/auth/login?client=android&code_challenge=${'a'.repeat(43)}`,
    });
    const elsewhere = new URL(String(login.headers.location));
    elsewhere.searchParams.set('redirect_uri', 'http://elsewhere.invalid/api/auth/callback');
    expect(() => server.signOn.authorize(elsewhere.toString())).toThrow(/redirect_uri/);
  });

  it('refuses a play without a session', async () => {
    const server = await boot();
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/play',
      payload: { ref: server.playable },
    });
    expect(res.statusCode).toBe(401);
  });
});
