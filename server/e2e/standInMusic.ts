/**
 * YouTube Music on the recorded server, for the browser's tests: search and radio answer from their
 * recordings, the extractor is a stand-in that answers from its recording, and the stream host serves
 * the 20 s synthesized Opus clip, so a song really plays. The last song of the recorded search is the
 * one whose failure is its own. Never in the image: only `e2e/` builds this.
 */
import { type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { type FetchLike } from '../src/adapters/http/fetch.js';
import { type Recording, recordingSchema } from '../src/adapters/http/recording.js';
import { replayFetch } from '../src/adapters/http/replay.js';
import { type YtSong, YtMusicClient } from '../src/adapters/ytmusic/client.js';
import { type SpawnLike } from '../src/music/extractor.js';
import { Music, type MusicLog } from '../src/music/index.js';
import { type Db } from '../src/store/connection.js';

export type MusicSource = 'answers' | 'unavailable';

const CLIP_SECONDS = 20;
const CHUNK_BYTES = 32 * 1024;
const REGION_BLOCKED =
  'ERROR: [youtube] x: The uploader has not made this video available in your country';

const recordingOf = (adapters: string, upstream: string, call: string): Recording =>
  recordingSchema.parse(
    JSON.parse(readFileSync(join(adapters, upstream, 'recordings', `${call}.json`), 'utf8')),
  );

interface Info {
  id: string;
  duration: number;
  formats: Record<string, unknown>[];
}

export function standInMusic(
  source: MusicSource,
  options: { adapters: string; art: string; dataDir: string },
) {
  const { adapters, art, dataDir } = options;
  const clip = readFileSync(join(adapters, 'googlevideo', 'recordings', 'opus-clip.webm'));
  const cover = readFileSync(art);
  const size = clip.byteLength;
  const info = (
    recordingOf(adapters, 'ytdlp', 'info-plain').response.body as { json: { stdout: Info } }
  ).json.stdout;

  const client = new YtMusicClient({
    baseUrl: 'http://upstream.invalid',
    fetch: replayFetch([
      recordingOf(adapters, 'ytmusic', 'search-songs'),
      recordingOf(adapters, 'ytmusic', 'next-radio'),
    ]),
    now: Date.now,
  });
  const short = (songs: YtSong[]) => songs.map((song) => ({ ...song, duration: CLIP_SECONDS }));
  const songSource = {
    search: async (query: string) => short(await client.search(query)),
    radio: async (id: string) => short(await client.radio(id)),
  };

  const spawn: SpawnLike = (_file, args) => {
    const id = args.at(-1)!;
    const child = new EventEmitter() as ChildProcess & EventEmitter;
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    Object.assign(child, { stdout, stderr, pid: 4242 });
    void client.search('').then((songs) => {
      const blocked = songs.at(-1)?.id === id;
      if (blocked) stderr.write(REGION_BLOCKED);
      else {
        stdout.write(
          JSON.stringify({
            ...info,
            id,
            duration: CLIP_SECONDS,
            formats: info.formats.map((row) =>
              row.format_id === '251' ? { ...row, filesize: size } : row,
            ),
          }),
        );
      }
      stdout.end();
      stderr.end();
      child.emit('close', blocked ? 1 : 0);
    });
    return child;
  };

  const streamFetch: FetchLike = async (url, init) => {
    if (!new URL(url).hostname.endsWith('googlevideo.com')) {
      return new Response(cover, { headers: { 'content-type': 'image/jpeg' } });
    }
    const range = new Headers(init?.headers).get('range') ?? '';
    const [first = 0, last = 0] = range.replace('bytes=', '').split('-').map(Number);
    const end = Math.min(last, size - 1);
    return new Response(clip.subarray(first, end + 1), {
      status: 206,
      headers: { 'content-type': 'audio/webm', 'content-range': `bytes ${first}-${end}/${size}` },
    });
  };

  return (log: MusicLog, db: Db) => {
    const music = new Music({
      db,
      log,
      now: Date.now,
      dataDir,
      capBytes: 64 * 1024 * 1024,
      imagePath: join(dataDir, 'extractor', 'stand-in', 'yt-dlp'),
      streamFetch,
      spawn,
      chunkBytes: CHUNK_BYTES,
      client: songSource,
      canary: () => Promise.resolve({ passed: false, reason: 'unavailable', ms: 1 }),
    });
    music.prepare();
    if (source === 'unavailable') music.state.canaryFailed('blocked');
    return { music, stop: () => undefined };
  };
}
