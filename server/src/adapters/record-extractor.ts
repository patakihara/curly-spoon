/**
 * Record mode's `extractor` part: what yt-dlp answers and how YouTube's stream host answers it, for
 * M3.ytmusic, with no account and no cookie. All of it runs in throwaway containers on the server,
 * so it leaves by the server's own address; a URL it hands out is tied to that address.
 *
 * - `ytdlp/info-plain`, `info-node`, `info-long`: `-j`, in each tier, and on a long track.
 * - `ytdlp/error-unavailable`, `error-botwall`: an id that does not exist, and the one request
 *   known to meet the bot wall.
 * - `googlevideo/range-head`, `range-chunk`, `range-416`: status and headers, from that container.
 * - `googlevideo/range-403`: the same URL, asked from another address (the VPN's). One call.
 *
 * A stream's bytes are never read: the body is cancelled at the headers, and a recording names a
 * synthesized clip (`scripts/fixtures/tone.sh`). A format's URL is rebuilt from an allowlist of its
 * parameters, the address, signatures and cache nodes out. The server's public address joins the
 * recorder's secrets, and each recording is scanned before it is written. Nothing here prints a URL.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractorArgs, type Tier } from '../music/extractor.js';
import { type Recording, serializeRecording } from './http/recording.js';
import { scanRecording } from './http/scan.js';
import {
  PLACEHOLDER,
  PLACEHOLDER_ORIGIN,
  RECORDED_STREAM_HOST,
  STREAM_HOST,
  type RawExchange,
  scrub,
} from './http/scrub.js';
import { ADDRESS_ECHO_URL, echoedAddress } from './record-ytmusic.js';

export const KNOWN_TRACK = 'lYBUbBu4W08';
/** No video has this id: yt-dlp's own answer for one that does not exist. */
export const NO_SUCH_TRACK = 'zzzzzzzzzz0';
export const BOT_WALL_ARGS = ['--extractor-args', 'youtube:player_skip=webpage,configs'];

const EXTRACTOR_ZIP =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_musllinux.zip';
const BASE_URL = 'https://www.youtube.com';
const BINARY = '/tmp/yt-dlp/yt-dlp_musllinux';

export const CLIP_FILE = 'opus-clip.webm';
export const CLIP_SYNTHESIZED =
  'A 20 s sine tone in Opus and WebM, from scripts/fixtures/tone.sh, in place of the real audio.';

const KEPT_INFO = ['id', 'duration', 'is_live', 'live_status', 'formats'] as const;
const KEPT_FORMAT = [
  'format_id',
  'ext',
  'acodec',
  'vcodec',
  'abr',
  'tbr',
  'filesize',
  'protocol',
  'url',
  'width',
  'height',
] as const;
const KEPT_URL_PARAMS = ['expire', 'itag', 'mime', 'clen', 'dur', 'source'];
const HIDDEN_URL_PARAMS = ['ip', 'sig', 'lsig', 'n', 'ei'];

export const EXTRACTOR_TRIMMED =
  'Trimmed by the recorder: named fields only, and each URL rebuilt with its address and signatures out.';

/** A format's URL with only what tests read: anything but a stream's own loses all of it. */
export function recordedFormatUrl(raw: string): string {
  const url = new URL(raw);
  if (!STREAM_HOST.test(url.hostname)) return `${PLACEHOLDER_ORIGIN}/elsewhere`;
  const base = `https://${RECORDED_STREAM_HOST}`;
  if (url.pathname !== '/videoplayback') return `${base}/elsewhere`;
  const kept = KEPT_URL_PARAMS.flatMap((name) => {
    const value = url.searchParams.get(name);
    return value === null ? [] : [`${name}=${encodeURIComponent(value)}`];
  });
  const hidden = HIDDEN_URL_PARAMS.map((name) => `${name}=${PLACEHOLDER}`);
  return `${base}/videoplayback?${[...kept, ...hidden].join('&')}`;
}

const pick = (row: Record<string, unknown>, names: readonly string[]) =>
  Object.fromEntries(names.filter((name) => name in row).map((name) => [name, row[name]]));

/** One `-j` answer, cut to the named fields, every URL rebuilt. */
export function trimInfo(info: Record<string, unknown>): Record<string, unknown> {
  const formats = (info.formats as Record<string, unknown>[]).map((format) => {
    const kept = pick(format, KEPT_FORMAT);
    return typeof kept.url === 'string' ? { ...kept, url: recordedFormatUrl(kept.url) } : kept;
  });
  return { ...pick(info, KEPT_INFO), formats, trimmed: EXTRACTOR_TRIMMED };
}

export interface ProcessCapture {
  call: string;
  version: string;
  argv: string[];
  rc: number;
  stdout: unknown;
  stderr: string;
}

/**
 * A process's run as a recording, so the scrubber and the scan treat it as any other: the command
 * line in the request's body, the exit code as the status, its output in the answer's.
 */
export function processRecording(run: ProcessCapture, secrets: string[]): Recording {
  const raw: RawExchange = {
    upstream: 'ytdlp',
    upstreamVersion: run.version,
    call: run.call,
    request: {
      method: 'EXEC',
      url: `${BASE_URL}/yt-dlp`,
      headers: {},
      body: { json: { argv: run.argv } },
    },
    response: {
      status: run.rc,
      headers: {},
      body: {
        json: { stdout: run.stdout, stderr: run.stderr.replace(/https?:\/\/\S+/g, '<url>') },
      },
    },
  };
  return scrub(raw, { secrets, baseUrl: BASE_URL });
}

export interface HeadAnswer {
  status: number;
  headers: Record<string, string>;
}

/** A stream host's answer as a recording: its URL rebuilt, its body the clip or nothing. */
export function headRecording(
  call: string,
  version: string,
  url: string,
  range: string,
  answer: HeadAnswer,
  secrets: string[],
): Recording {
  const raw: RawExchange = {
    upstream: 'googlevideo',
    upstreamVersion: version,
    call,
    request: { method: 'GET', url: recordedFormatUrl(url), headers: { range }, body: null },
    response: {
      status: answer.status,
      headers: answer.headers,
      body: answer.status === 206 ? { bytes: CLIP_FILE, synthesized: CLIP_SYNTHESIZED } : null,
    },
  };
  return scrub(raw, { secrets, baseUrl: BASE_URL });
}

/** Asks one range and prints its status and headers. The body is cancelled unread. */
const HEAD_SCRIPT = `
const [url, range] = require('fs').readFileSync(0, 'utf8').trim().split('\\n');
fetch(url, { headers: { range }, redirect: 'manual' }).then(async (r) => {
  await r.body?.cancel();
  console.log(JSON.stringify({ status: r.status, headers: Object.fromEntries(r.headers) }));
});`;

export interface ExecResult {
  rc: number;
  stdout: string;
  stderr: string;
}

export interface ExtractorRecordInput {
  /** Runs a command on this machine, with `stdin` when given: ssh, in real use. */
  exec: (argv: string[], stdin?: string) => Promise<ExecResult>;
  out: (line: string) => void;
  root: string;
  /** A track of about an hour, for `info-long`. */
  longTrack: string;
}

/** A word the far shell reads back as itself: ssh joins its arguments and hands them to a shell. */
export const shellWord = (word: string) => `'${word.replace(/'/g, `'\\''`)}'`;

/** The argv that runs `argv` on the server, each word whole, nothing for its shell to act on. */
export const onServer = (...argv: string[]) => [
  'ssh',
  'mediaserver',
  argv.map(shellWord).join(' '),
];

export async function recordExtractor(input: ExtractorRecordInput): Promise<{ written: string[] }> {
  const { exec, out, root } = input;
  const name = `auralis-record-${randomBytes(4).toString('hex')}`;
  const inBox = (...argv: string[]) => onServer('docker', 'exec', '-i', name, ...argv);
  const must = async (argv: string[], stdin?: string) => {
    const result = await exec(argv, stdin);
    if (result.rc !== 0) throw new Error(`a recording step failed with ${result.rc}`);
    return result;
  };

  await must(
    onServer(
      ...'docker run -d --rm --name'.split(' '),
      name,
      ...'--user 1000:1000 --network bridge --memory 700m --cpus 1'.split(' '),
      ...'node:22-alpine sleep 1200'.split(' '),
    ),
  );
  try {
    await must(
      inBox(
        'sh',
        '-c',
        `cd /tmp && wget -qO y.zip ${EXTRACTOR_ZIP} && mkdir yt-dlp && cd yt-dlp && unzip -q ../y.zip && chmod +x yt-dlp_musllinux`,
      ),
    );
    const version = `yt-dlp ${(await must(inBox(BINARY, '--version'))).stdout.trim()}`;
    const address = echoedAddress((await must(inBox('wget', '-qO-', ADDRESS_ECHO_URL))).stdout);
    const secrets = [address];
    out(`recording with ${version}, from the server's address`);

    const written: string[] = [];
    const write = async (recording: Recording) => {
      const findings = scanRecording(recording);
      const text = serializeRecording(recording);
      if (findings.length > 0 || text.includes(address)) {
        const found = findings.map((f) => `${f.kind} at ${f.path}`).join(', ');
        throw new Error(`${recording.call}: ${found || 'the address'}; not written`);
      }
      const dir = join(root, recording.upstream, 'recordings');
      await mkdir(dir, { recursive: true });
      const file = join(dir, `${recording.call}.json`);
      await writeFile(file, text);
      written.push(file);
      out(`${recording.call}: ${recording.response.status}`);
    };

    const run = async (id: string, tier: Tier, extra: string[] = []) => {
      const args = extractorArgs(id, tier);
      const end = args.indexOf('--');
      const argv = [...args.slice(0, end), ...extra, ...args.slice(end)];
      const result = await exec(inBox('env', 'HOME=/tmp', BINARY, ...argv));
      return { argv: ['yt-dlp', ...argv], ...result };
    };
    const info = async (call: string, id: string, tier: Tier) => {
      const { argv, rc, stdout, stderr } = await run(id, tier);
      if (rc !== 0) throw new Error(`${call}: the extractor answered ${rc}`);
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      await write(
        processRecording({ call, version, argv, rc, stdout: trimInfo(parsed), stderr }, secrets),
      );
      return parsed;
    };
    const failure = async (call: string, id: string, extra: string[]) => {
      const { argv, rc, stderr } = await run(id, 'plain', extra);
      if (rc === 0) throw new Error(`${call}: the extractor passed`);
      await write(processRecording({ call, version, argv, rc, stdout: null, stderr }, secrets));
    };

    const plain = await info('info-plain', KNOWN_TRACK, 'plain');
    await info('info-node', KNOWN_TRACK, 'node');
    await info('info-long', input.longTrack, 'plain');
    await failure('error-unavailable', NO_SUCH_TRACK, []);
    await failure('error-botwall', KNOWN_TRACK, BOT_WALL_ARGS);

    const opus = (plain.formats as { format_id: string; url: string; filesize: number }[]).find(
      (format) => format.format_id === '251',
    );
    if (opus === undefined) throw new Error('the known track has no format 251');
    const head = async (call: string, range: string) => {
      const answer = await must(inBox('node', '-e', HEAD_SCRIPT), `${opus.url}\n${range}\n`);
      const parsed = JSON.parse(answer.stdout) as HeadAnswer;
      await write(headRecording(call, version, opus.url, range, parsed, secrets));
      return parsed;
    };
    const first = await head('range-head', 'bytes=0-1');
    if (first.headers['content-range'] !== `bytes 0-1/${opus.filesize}`) {
      throw new Error("the stream's size is not the size the extractor named");
    }
    await head('range-chunk', 'bytes=0-1048575');
    await head('range-416', `bytes=${opus.filesize + 10}-`);

    const away = await must(
      onServer(
        ...'docker run --rm -i --network container:gluetun --memory 200m'.split(' '),
        ...'node:22-alpine node -e'.split(' '),
        HEAD_SCRIPT,
      ),
      `${opus.url}\nbytes=0-1\n`,
    );
    const refused = JSON.parse(away.stdout) as HeadAnswer;
    if (refused.status !== 403) throw new Error(`another address answered ${refused.status}`);
    await write(headRecording('range-403', version, opus.url, 'bytes=0-1', refused, secrets));
    return { written };
  } finally {
    await exec(onServer('docker', 'rm', '-f', name));
  }
}
