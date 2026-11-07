/**
 * [M3.ytmusic/b], live: the image's own canary, run inside a running container on this server, reads
 * ten seconds of a known track. It reaches the server over ssh, so it runs only with LIVE_SERVER=1,
 * from the laptop; `pnpm test` and CI's unit job leave this file out, as a skipped result there would
 * replace the live run's for the same name. It leaves nothing in the image and prints no URL.
 *
 *   LIVE_SERVER=1 LIVE_CONTAINER=auralis-e2e node --test --test-reporter=spec \
 *     --test-reporter-destination=stdout --test-reporter=junit \
 *     --test-reporter-destination=reports/canary.xml scripts/mediaserver/canary.live.test.mjs
 *
 * LIVE_SSH names the ssh host, mediaserver by default. server-live.yml takes the JUnit to the plan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { CANARY_TEST, canaryProblems, probeCommand, readProbe } from './canary-probe.mjs';

const skip = process.env.LIVE_SERVER === '1' ? false : 'a live check: set LIVE_SERVER=1';
const TIMEOUT = 120_000;

test(CANARY_TEST, { skip, timeout: TIMEOUT }, (t) => {
  const { args, input } = probeCommand({
    host: process.env.LIVE_SSH ?? 'mediaserver',
    container: process.env.LIVE_CONTAINER ?? 'auralis-e2e',
  });
  const run = spawnSync('ssh', args, { input, encoding: 'utf8', timeout: TIMEOUT - 5_000 });
  assert.equal(run.status, 0, `the probe exited ${run.status}: ${run.stderr.slice(-400)}`);
  const probe = readProbe(run.stdout);
  t.diagnostic(`canary ${JSON.stringify(probe)}`);
  assert.deepEqual(canaryProblems(probe), []);
});
