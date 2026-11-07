/**
 * What the live canary test asks of a running container, and how it judges the answer. The audio
 * here is the Opus stand-in recorded answers use; the real song is the live test's own.
 * Run: node --test scripts/mediaserver/canary-probe.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canaryProblems,
  opusSeconds,
  probeCommand,
  probeScript,
  readProbe,
} from './canary-probe.mjs';

/** 20 s of Opus in WebM. */
const CLIP = readFileSync(
  new URL('../../server/src/adapters/googlevideo/recordings/opus-clip.webm', import.meta.url),
);

const passing = {
  commit: 'f5c58ebd2ed72305556dea3f664536795e8debff',
  version: '2026.10.26',
  reportedVersion: '2026.10.26',
  tier: 'plain',
  resolveMs: 2200,
  bytes: 512_000,
  closed: true,
  codec: 'A_OPUS',
  audioSeconds: 20.1,
  passed: true,
};

test('the length of the audio in a WebM is read from its Opus packets', () => {
  assert.ok(Math.abs(opusSeconds(CLIP) - 20) < 0.1, `read ${opusSeconds(CLIP)} s of a 20 s clip`);
});

test('a WebM cut short counts only the audio that arrived whole', () => {
  const half = opusSeconds(CLIP.subarray(0, CLIP.length >> 1));
  assert.ok(half > 8 && half < 12, `read ${half} s of half a 20 s clip`);
});

test('a WebM head with no packets holds no audio, and neither do bytes that are not a WebM', () => {
  assert.equal(opusSeconds(CLIP.subarray(0, 64)), 0);
  assert.equal(opusSeconds(Buffer.alloc(4096, 0x41)), 0);
});

test('a canary that read ten seconds of a named extractor from this image passes', () => {
  assert.deepEqual(canaryProblems(passing), []);
});

for (const [what, change, problem] of [
  ['failed', { passed: false, reason: 'blocked' }, /did not pass: blocked/],
  ['read under ten seconds', { audioSeconds: 9.9 }, /9\.9 s of audio/],
  ['asked an open range', { closed: false }, /closed range/],
  ['read no bytes', { bytes: 0 }, /no bytes/],
  ['ran another extractor than it named', { reportedVersion: '2025.01.01' }, /answers 2025.01.01/],
  ['read some other codec', { codec: 'mp4' }, /codec mp4/],
]) {
  test(`a canary that ${what} does not pass`, () => {
    assert.match(canaryProblems({ ...passing, ...change }).join('\n'), problem);
  });
}

test('the probe prints one line of JSON, and a line naming a URL is refused unread', () => {
  assert.deepEqual(readProbe(`${JSON.stringify(passing)}\n`), passing);
  assert.throws(() => readProbe('{"url":"https://example.invalid/x"}'), /printed a URL/);
  assert.throws(() => readProbe('not json'), /not JSON/);
});

test('the probe runs with what the image holds, from stdin, leaving no file behind in the image', () => {
  const { args, input } = probeCommand({ host: 'box', container: 'auralis-e2e' });
  assert.deepEqual(args.slice(0, 2), ['box', 'docker']);
  assert.ok(args.includes('auralis-e2e'));
  assert.deepEqual(args.slice(-3), ['--import', 'tsx', '--input-type=module']);
  assert.equal(input, probeScript());
  assert.match(input, /file:\/\/\/app\/server\/src\/music\/canary\.ts/);
  assert.doesNotMatch(input, /reveal\(\)/);
});
