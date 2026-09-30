/**
 * The real server on recorded upstreams, for the Android emulator's tests. It is `assembleServer`,
 * as `main.ts` runs it, configured through its environment, with one thing swapped: the `fetch`
 * its adapters are given answers from the committed recordings instead of the network.
 *
 * The sign-on is replayed from its recordings (discovery, keys, token exchange, userinfo) by a
 * stand-in that also does the two things a browser meets and a recording cannot hold: it serves
 * the authorize step, sending the browser back to the app with a fresh code and the same state,
 * and it re-signs the recorded ID token with the test key for that sign-in's nonce and the time of
 * the exchange. Every other claim is the recording's, so the identity is the recorded one.
 *
 * Nothing here ships: the image copies `server/src` without its tests and recordings, and never
 * this folder (`scripts/guards/image.test.mjs`).
 */
import { createServer, type Server as HttpServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type MediaRef } from '@auralis/schema';
import type { FastifyInstance } from 'fastify';
import { type FetchLike } from '../src/adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../src/adapters/http/recording.js';
import { replayFetch, standInsBeside } from '../src/adapters/http/replay.js';
import { PLACEHOLDER, PLACEHOLDER_ORIGIN } from '../src/adapters/http/scrub.js';
import { decodePart, signWithTestKey } from '../src/adapters/http/testSigningKey.js';
import { type BuildAppOptions } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { assembleServer } from '../src/server.js';
import { s256 } from '../src/store/signIn.js';

const ADAPTERS = fileURLToPath(new URL('../src/adapters/', import.meta.url));

/** The recorded sign-on's issuer, as its discovery, ID token and the scrubber name it. */
const SIGN_ON_ISSUER = PLACEHOLDER_ORIGIN;
const ABS_ORIGIN = 'http://abs.upstream.invalid';
const JELLYFIN_ORIGIN = 'http://jellyfin.upstream.invalid';
/** Listens on loopback only; the emulator reaches it as 10.0.2.2, or through `adb reverse`. */
const LISTEN_HOST = '127.0.0.1';

export interface RecordedServerOptions {
  /** The host clients use in URLs; the listeners stay on loopback. Default `127.0.0.1`. */
  address?: string;
  port?: number;
  signOnPort?: number;
  logger?: BuildAppOptions['logger'];
}

export interface RecordedServer {
  /** The app, built and ready; `listen()` opens it and the sign-on to the network. */
  app: FastifyInstance;
  /** Where clients reach the app. */
  origin: string;
  signOn: {
    origin: string;
    /** The authorize step: an authorization URL in, where the browser is sent back to out. */
    authorize(url: string): string;
  };
  /** The recorded identity every sign-in becomes. */
  user: { username: string; groups: string[] };
  /** The recorded item that plays: one file. */
  playable: MediaRef;
  /** The recorded book of four files, played directly, timed by its 5 s stand-in tones. */
  multiFile: MediaRef;
  listen(): Promise<void>;
  close(): Promise<void>;
}

function recordingsOf(upstream: string): Recording[] {
  const dir = join(ADAPTERS, upstream, 'recordings');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, name), 'utf8'))));
}

function call(recordings: Recording[], name: string): Recording {
  const found = recordings.find((r) => r.call === name);
  if (!found) throw new Error(`no ${name} recording`);
  return found;
}

function jsonOf<T>(recording: Recording): T {
  const { body } = recording.response;
  if (body === null || !('json' in body)) throw new Error(`${recording.call} has no JSON body`);
  return body.json as T;
}

/** An MPEG-1 Layer III file's length in seconds, from its frames: 1152 samples each. */
export function mp3Seconds(bytes: Uint8Array): number {
  const BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const RATES = [44_100, 48_000, 32_000];
  let at = 0;
  let frames = 0;
  let rate = 0;
  while (at + 4 <= bytes.length) {
    const [a, b, c] = [bytes[at]!, bytes[at + 1]!, bytes[at + 2]!];
    if (a !== 0xff || (b & 0xfe) !== 0xfa)
      throw new Error(`not an MPEG-1 Layer III frame at ${at}`);
    const bitrate = BITRATES[c >> 4];
    rate = RATES[(c >> 2) & 3] ?? 0;
    if (!bitrate || !rate) throw new Error(`a free or bad bitrate or sample rate at ${at}`);
    at += Math.floor((144_000 * bitrate) / rate) + ((c >> 1) & 1);
    frames++;
  }
  return (frames * 1152) / rate;
}

/**
 * [recorded], a play session of a book whose files are all the stand-in [tone], timed by that
 * tone: each track as long as it, starting where the last ends, and each file one chapter under its
 * recorded title. The recordings keep the real timings, which the adapter tests read.
 */
function timedByStandIns(recorded: Recording, tone: string): Recording {
  const seconds = mp3Seconds(readFileSync(join(ADAPTERS, 'audiobookshelf', 'recordings', tone)));
  const timed = structuredClone(recorded);
  const session = jsonOf<{
    duration: number;
    audioTracks: { duration: number; startOffset: number }[];
    chapters: { start: number; end: number }[];
  }>(timed);
  session.audioTracks.forEach((track, i) => {
    track.startOffset = i * seconds;
    track.duration = seconds;
  });
  session.chapters = session.chapters
    .slice(0, session.audioTracks.length)
    .map((chapter, i) => ({ ...chapter, start: i * seconds, end: (i + 1) * seconds }));
  session.duration = session.audioTracks.length * seconds;
  return timed;
}

/** Sends each request to the replay for its upstream's origin. */
function byOrigin(upstreams: Record<string, FetchLike>): FetchLike {
  return (url, init) => {
    const replay = upstreams[new URL(url).origin];
    if (!replay) throw new Error(`no recorded upstream at ${new URL(url).origin}`);
    return replay(url, init);
  };
}

interface Pending {
  nonce: string;
  challenge: string;
}

/** The recorded sign-on, with a live authorize step and ID tokens minted per exchange. */
function standInSignOn(options: { origin: string; clientId: string; redirectUri: string }) {
  const recorded = recordingsOf('oidc');
  const discovery = structuredClone(call(recorded, 'discovery'));
  const discoveryJson = jsonOf<{ authorization_endpoint: string; token_endpoint: string }>(
    discovery,
  );
  discoveryJson.authorization_endpoint = `${options.origin}/authorize`;
  const tokenPath = new URL(discoveryJson.token_endpoint).pathname;
  const token = call(recorded, 'token');
  const tokenJson = jsonOf<{ id_token: string }>(token);
  const [idHeader, idPayload] = tokenJson.id_token.split('.') as [string, string];
  const claims = decodePart(idPayload) as { iat: number; exp: number };
  const replay = replayFetch(recorded.map((r) => (r.call === 'discovery' ? discovery : r)));
  const pending = new Map<string, Pending>();

  function authorize(url: string): string {
    const params = new URL(url).searchParams;
    const need = (name: string, expected?: string): string => {
      const value = params.get(name);
      if (value === null || value === '' || (expected !== undefined && value !== expected)) {
        throw new Error(`authorize: ${name} is ${value === null ? 'missing' : `not ${expected}`}`);
      }
      return value;
    };
    need('response_type', 'code');
    need('client_id', options.clientId);
    const redirectUri = need('redirect_uri', options.redirectUri);
    need('code_challenge_method', 'S256');
    const state = need('state');
    const code = randomBytes(24).toString('base64url');
    pending.set(code, { nonce: need('nonce'), challenge: need('code_challenge') });
    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    back.searchParams.set('state', state);
    return back.toString();
  }

  const fetch: FetchLike = async (url, init) => {
    if ((init?.method ?? 'GET') !== 'POST' || new URL(url).pathname !== tokenPath) {
      return replay(url, init);
    }
    const form = new URLSearchParams(String(init?.body ?? ''));
    const code = form.get('code') ?? '';
    const started = pending.get(code);
    pending.delete(code);
    if (!started || s256(form.get('code_verifier') ?? '') !== started.challenge) {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    const idToken = signWithTestKey(decodePart(idHeader), {
      ...claims,
      nonce: started.nonce,
      iat: now,
      auth_time: now,
      exp: now + (claims.exp - claims.iat),
    });
    return new Response(JSON.stringify({ ...tokenJson, id_token: idToken }), {
      status: token.response.status,
      headers: token.response.headers,
    });
  };

  return { authorize, fetch };
}

/** The standing sign-on's authorize step over HTTP: a 302 back to the app, or a 400. */
function signOnListener(authorize: (url: string) => string, origin: string): HttpServer {
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', origin);
    if (req.method !== 'GET' || url.pathname !== '/authorize') {
      res.writeHead(404).end();
      return;
    }
    try {
      res.writeHead(302, { location: authorize(url.toString()) }).end();
    } catch (error) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end(String(error));
    }
  });
}

export async function recordedServer(options: RecordedServerOptions = {}): Promise<RecordedServer> {
  const address = options.address ?? LISTEN_HOST;
  const port = options.port ?? 8787;
  const signOnPort = options.signOnPort ?? 8788;
  const origin = `http://${address}:${port}`;
  const signOnOrigin = `http://${address}:${signOnPort}`;

  const dataDir = mkdtempSync(join(tmpdir(), 'auralis-recorded-'));
  const secret = (name: string) => {
    const file = join(dataDir, name);
    writeFileSync(file, `${PLACEHOLDER}\n`);
    chmodSync(file, 0o600);
    return file;
  };
  const clientId = (
    decodePart(
      jsonOf<{ id_token: string }>(call(recordingsOf('oidc'), 'token')).id_token.split('.')[1]!,
    ) as { azp: string }
  ).azp;
  const config = loadConfig({
    PORT: String(port),
    HOST: LISTEN_HOST,
    DATA_DIR: join(dataDir, 'data'),
    PUBLIC_ORIGIN: origin,
    OIDC_ISSUER: SIGN_ON_ISSUER,
    OIDC_CLIENT_ID: clientId,
    OIDC_CLIENT_SECRET_FILE: secret('oidc-client-secret'),
    ABS_URL: ABS_ORIGIN,
    ABS_PROVISION_KEY_FILE: secret('abs-provision-key'),
    JELLYFIN_URL: JELLYFIN_ORIGIN,
    JELLYFIN_API_KEY_FILE: secret('jellyfin-api-key'),
    // The recordings hold one page of each library, not the pages a real run starts from.
    INDEX_EVERY_MINUTES: '0',
  });

  const signOn = standInSignOn({
    origin: signOnOrigin,
    clientId,
    redirectUri: config.oidc!.redirectUri,
  });
  // The four-file book is recorded twice under one play call, directly and transcoded, and its
  // first segment twice, before and after it was cut. The server replays direct play and the cut
  // segment; the transcode's plan is exercised in server/src/play.test.ts.
  // Its files are all one 5 s stand-in tone, so the book is served timed by that tone.
  const abs = recordingsOf('audiobookshelf')
    .filter((r) => r.call !== 'hls-play' && r.call !== 'hls-segment-pending')
    .map((r) => (r.call === 'multi-play' ? timedByStandIns(r, 'multi-file.mp3') : r));
  const server = await assembleServer(config, {
    fetch: byOrigin({
      [SIGN_ON_ISSUER]: signOn.fetch,
      [ABS_ORIGIN]: replayFetch(abs, { readBytes: standInsBeside(ADAPTERS) }),
      [JELLYFIN_ORIGIN]: replayFetch(recordingsOf('jellyfin')),
    }),
    logger: options.logger,
  });

  const userinfo = jsonOf<{ preferred_username: string; groups: string[] }>(
    call(recordingsOf('oidc'), 'userinfo'),
  );
  const itemId = call(abs, 'item-play').request.path.split('/')[3] ?? '';
  const multiId = call(abs, 'multi-play').request.path.split('/')[3] ?? '';
  const signOnHttp = signOnListener(signOn.authorize, signOnOrigin);

  return {
    app: server.app,
    origin,
    signOn: { origin: signOnOrigin, authorize: signOn.authorize },
    user: { username: userinfo.preferred_username, groups: userinfo.groups },
    playable: { source: 'abs', id: itemId },
    multiFile: { source: 'abs', id: multiId },
    async listen() {
      await new Promise<void>((resolve, reject) => {
        signOnHttp.once('error', reject).listen(signOnPort, LISTEN_HOST, resolve);
      });
      await server.app.listen({ port, host: LISTEN_HOST });
    },
    async close() {
      await new Promise<void>((resolve) => {
        if (!signOnHttp.listening) resolve();
        else signOnHttp.close(() => resolve());
      });
      await server.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
