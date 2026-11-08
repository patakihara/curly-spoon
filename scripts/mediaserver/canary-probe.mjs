/**
 * The live canary test's probe: a script sent over stdin to `node` in a running container, so the
 * image needs nothing added. It runs the image's own canary as the daily job does, with the
 * container's own configuration, keeping the bytes the canary read. It prints one line of JSON:
 * never a stream's URL.
 *
 * How long those bytes play is counted here rather than taken from their number: only whole Opus
 * packets count, by what each packet's first byte says it holds (RFC 6716, 3.1).
 */

/** The plan check this proves; only this name may reach it from server-live.yml. */
export const CANARY_TEST =
  '[M3.ytmusic/b] a live canary resolves and plays 10 seconds of a known track from this server';

const LEAST_SECONDS = 10;

/** Seconds of audio in whole Opus packets of a WebM's bytes. Sent to the container as source. */
export function opusSeconds(bytes) {
  const SEGMENT = 0x18538067;
  const CLUSTER = 0x1f43b675;
  const SIMPLE_BLOCK = 0xa3;
  const BLOCK_GROUP = 0xa0;
  const BLOCK = 0xa1;
  /** Each frame's length by the packet's configuration, in tenths of a millisecond. */
  const frameTenths = (config) => {
    if (config < 12) return [100, 200, 400, 600][config % 4];
    if (config < 16) return [100, 200][config % 2];
    return [25, 50, 100, 200][config % 4];
  };
  const packetTenths = (packet) => {
    const toc = packet[0];
    if (toc === undefined) return 0;
    const code = toc & 3;
    const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
    return frames * frameTenths(toc >> 3);
  };
  const blockTenths = (at, end) => {
    const trackLength = Math.clz32(bytes[at] ?? 0) - 23;
    const lacing = ((bytes[at + trackLength + 2] ?? 0) >> 1) & 3;
    if (trackLength < 1 || trackLength > 8 || lacing !== 0) return 0;
    return packetTenths(bytes.subarray(at + trackLength + 3, end));
  };
  const walk = (from, to, parent) => {
    let tenths = 0;
    let at = from;
    while (at < to) {
      const idLength = Math.clz32(bytes[at] ?? 0) - 23;
      if (idLength < 1 || idLength > 4 || at + idLength >= to) return tenths;
      let id = 0;
      for (let i = 0; i < idLength; i += 1) id = id * 256 + (bytes[at + i] ?? 0);
      at += idLength;
      const head = bytes[at] ?? 0;
      const sizeLength = Math.clz32(head) - 23;
      if (sizeLength < 1 || sizeLength > 8 || at + sizeLength > to) return tenths;
      let size = head & (0xff >> sizeLength);
      let unknown = size === 0xff >> sizeLength;
      for (let i = 1; i < sizeLength; i += 1) {
        const byte = bytes[at + i] ?? 0;
        unknown &&= byte === 0xff;
        size = size * 256 + byte;
      }
      at += sizeLength;
      const end = unknown ? to : at + size;
      const whole = end <= to;
      if (id === SEGMENT || id === CLUSTER || id === BLOCK_GROUP) {
        tenths += walk(at, Math.min(end, to), id);
      } else if (whole && (id === SIMPLE_BLOCK || id === BLOCK)) {
        const inAudio = parent === CLUSTER || parent === BLOCK_GROUP;
        if (inAudio) tenths += blockTenths(at, end);
      }
      at = Math.min(end, to);
    }
    return tenths;
  };
  return walk(0, bytes.length, null) / 10_000;
}

/** What runs in the container, its one output a line of JSON. */
export function probeScript() {
  return `
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { basename, dirname } from 'node:path';
import { loadConfig } from 'file:///app/server/src/config.ts';
import { publicFetch } from 'file:///app/server/src/adapters/http/publicFetch.ts';
import { YtMusicClient, YTMUSIC_URL } from 'file:///app/server/src/adapters/ytmusic/client.ts';
import { canaryOf } from 'file:///app/server/src/music/canary.ts';

const opusSeconds = ${opusSeconds.toString()};

const config = loadConfig();
const { extractorPath, canaryId, canaryQuery } = config.ytmusic;
const now = Date.now;
const home = mkdtempSync('/tmp/auralis-canary-');
const reached = publicFetch({
  lookup: async (host) => (await lookup(host, { all: true })).map(({ address }) => address),
});
let resolveMs = 0;
let asked = null;
let kept = null;
const canary = canaryOf({
  search: (query) =>
    new YtMusicClient({
      baseUrl: YTMUSIC_URL,
      fetch: (url, init) => globalThis.fetch(url, init),
      now,
      onBad: () => undefined,
    }).search(query),
  fetch: async (url, init) => {
    const answer = await reached(url, init);
    asked = new Headers(init?.headers).get('range');
    kept = answer.clone().arrayBuffer();
    return answer;
  },
  spawn: (file, args, options) => {
    const started = now();
    const child = spawn(file, args, options);
    child.on('close', () => {
      resolveMs += now() - started;
    });
    return child;
  },
  home,
  now,
  id: canaryId,
  query: canaryQuery,
});
const result = await canary(extractorPath);
const read = kept === null ? Buffer.alloc(0) : Buffer.from(await kept);
rmSync(home, { recursive: true, force: true });
console.log(
  JSON.stringify({
    commit: config.commit ?? null,
    version: basename(dirname(extractorPath)),
    reportedVersion: execFileSync(extractorPath, ['--version'], {
      env: { HOME: '/tmp', PATH: '/usr/local/bin:/usr/bin:/bin' },
      encoding: 'utf8',
    }).trim(),
    tier: result.tier ?? null,
    resolveMs,
    bytes: read.byteLength,
    closed: /^bytes=\\d+-\\d+$/.test(asked ?? ''),
    codec: result.codec ?? null,
    audioSeconds: opusSeconds(read),
    passed: result.passed,
    ...(result.passed ? {} : { reason: result.reason }),
  }),
);
process.exit(0);
`;
}

/** `ssh` and what it runs, with the probe as its stdin. The image's cwd for tsx is /app/server. */
export function probeCommand({ host, container }) {
  return {
    args: [
      host,
      'docker',
      'exec',
      '-i',
      '-w',
      '/app/server',
      container,
      'node',
      '--import',
      'tsx',
      '--input-type=module',
    ],
    input: probeScript(),
  };
}

/** The probe's line, which holds no URL or is refused. */
export function readProbe(stdout) {
  if (/https?:|googlevideo/i.test(stdout)) throw new Error('the probe printed a URL');
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('the probe’s output is not JSON');
  }
}

/** What stops this reading proving the check; empty when it does. */
export function canaryProblems(probe) {
  const problems = [];
  if (!probe.passed) problems.push(`the canary did not pass: ${probe.reason ?? 'no reason'}`);
  if (probe.reportedVersion !== probe.version) {
    problems.push(`the extractor named ${probe.version} answers ${probe.reportedVersion}`);
  }
  if (!(probe.bytes > 0)) problems.push('it read no bytes');
  if (!probe.closed) problems.push('it did not ask a closed range');
  if (probe.codec !== 'A_OPUS') problems.push(`it read codec ${probe.codec}`);
  if (!(probe.audioSeconds >= LEAST_SECONDS)) {
    problems.push(`it read ${probe.audioSeconds} s of audio, under ${LEAST_SECONDS} s`);
  }
  return problems;
}
