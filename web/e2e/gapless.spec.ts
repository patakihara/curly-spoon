import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build, type Rollup } from 'vite';
import { type PlaybackPlan, type createPlayer } from '../src/playback';

/**
 * The web player engine in Chromium, playing the recorded four-file book from the server on
 * recorded upstreams (`pnpm --filter @auralis/server e2e:serve`, as the emulator's tests run it):
 * a real sign-in, a real plan and the server's own range proxy, each file a 5 s stand-in tone the plan is timed by.
 * The engine has no page yet, so it is bundled as it is and run on the server's origin, where the
 * session cookie reaches its requests.
 */

/** A file ending and the next one playing, further apart than this, is a pause you hear. */
const MAX_GAP_MS = 50;
/** How far either side of the boundary the position is compared with the wall clock. */
const WINDOW_MS = 500;
/** Across the boundary, how far the position gained may part from the wall time passed. */
const MAX_TRACK_SLACK_MS = 150;
/** How much more than the time between two reports the position may gain. */
const MAX_JUMP_SLACK_MS = 100;

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let serving: ChildProcess | undefined;
let origin: string;
let multiFile: { source: string; id: string };
let engine: string;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject).listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/** Starts the recorded-upstreams server and reads where it is and what it plays from its banner. */
async function serveRecorded() {
  const child = spawn('node_modules/.bin/tsx', ['e2e/serve.ts'], {
    cwd: fileURLToPath(new URL('../../server/', import.meta.url)),
    env: {
      ...process.env,
      AURALIS_E2E_PORT: String(await freePort()),
      AURALIS_E2E_SIGN_ON_PORT: String(await freePort()),
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  serving = child;
  const banner = await new Promise<string>((resolve, reject) => {
    let out = '';
    child.once('exit', (code) => reject(new Error(`e2e:serve exited ${code}: ${out}`)));
    child.stdout!.on('data', (chunk: Buffer) => {
      out += chunk.toString();
      if (/^ready$/m.test(out)) resolve(out);
    });
  });
  const line = (label: string) =>
    new RegExp(`^\\s*${label}:\\s*(\\S+)$`, 'm').exec(banner)?.[1] ?? '';
  const key = line('four files');
  origin = line('app');
  multiFile = { source: key.slice(0, key.indexOf(':')), id: key.slice(key.indexOf(':') + 1) };
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await serveRecorded();
  const output = (await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL('../src/playback.ts', import.meta.url)),
        name: 'AuralisPlayback',
        formats: ['iife'],
      },
    },
  })) as Rollup.RollupOutput[];
  engine = output[0]!.output[0].code;
});

test.afterAll(() => {
  serving?.kill('SIGTERM');
});

test('[M1.play/c] plays a two-file boundary with no pause, the position running on across it', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // The web sign-in, through the stand-in sign-on and back, lands on a same-origin page.
  await page.goto(`${origin}/api/auth/login?client=web&return_to=/api/health`);
  await expect(page).toHaveURL(`${origin}/api/health`);
  await page.addScriptTag({ content: engine });

  const run = await page.evaluate(async (ref) => {
    const planned = await fetch('/api/play', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    if (!planned.ok) throw new Error(`POST /api/play answered ${planned.status}`);
    const plan = (await planned.json()) as PlaybackPlan;
    const events: { type: string; src: string; at: number }[] = [];
    const positions: { position: number; at: number }[] = [];
    const audios: HTMLAudioElement[] = [];
    const { createPlayer: create } = (
      window as unknown as { AuralisPlayback: { createPlayer: typeof createPlayer } }
    ).AuralisPlayback;
    const player = create(plan, {
      createAudio: () => {
        const audio = new Audio();
        audios.push(audio);
        for (const type of ['playing', 'ended'])
          audio.addEventListener(type, () =>
            events.push({ type, src: new URL(audio.src).pathname, at: performance.now() }),
          );
        return audio;
      },
      onPosition: (position) => positions.push({ position, at: performance.now() }),
    });
    const second = plan.tracks[1]!.url;
    await player.play();
    // On past the boundary, until the second file has played a second of its own, by its own
    // element's clock: the position the engine reports is only what is checked.
    const secondPlayedASecond = () =>
      audios.some((a) => a.src !== '' && new URL(a.src).pathname === second && a.currentTime >= 1);
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('the second file never played')), 30_000);
      const poll = setInterval(() => {
        if (secondPlayedASecond()) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolve();
        }
      }, 50);
    });
    const last = player.position;
    await player.destroy();
    return { events, positions, last, second, offset: plan.tracks[1]!.offset };
  }, multiFile);

  const first = run.events.find((e) => e.type === 'ended');
  const next = run.events.find((e) => e.type === 'playing' && e.src === run.second);
  expect(first, 'the first file ends').toBeDefined();
  expect(first!.src).not.toBe(run.second);
  expect(next, 'the second file plays').toBeDefined();
  const gap = next!.at - first!.at;
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(MAX_GAP_MS);
  test.info().annotations.push({ type: 'gap', description: `${gap.toFixed(1)} ms` });

  const positions = run.positions.map((p) => p.position);
  expect(positions.length).toBeGreaterThan(10);
  expect(positions.some((p) => p > 0 && p < run.offset)).toBe(true);
  expect(positions.some((p) => p >= run.offset)).toBe(true);
  expect(run.last).toBeGreaterThanOrEqual(run.offset + 1);

  // Continuity: between two reports the position never goes back, and gains no more than the
  // time between them plus a little.
  for (let i = 1; i < run.positions.length; i++) {
    const [a, b] = [run.positions[i - 1]!, run.positions[i]!];
    const gained = b.position - a.position;
    expect(gained, `from ${a.position} to ${b.position}`).toBeGreaterThanOrEqual(0);
    expect(gained * 1000, `from ${a.position} to ${b.position}`).toBeLessThanOrEqual(
      b.at - a.at + MAX_JUMP_SLACK_MS,
    );
  }
  // Across the boundary the position gained tracks the wall time passed: a pause or silence is
  // wall time without position, a skip is position without wall time.
  const crossed = run.positions.find((p) => p.position >= run.offset)!;
  const before = run.positions.findLast((p) => p.at <= crossed.at - WINDOW_MS);
  const after = run.positions.find((p) => p.at >= crossed.at + WINDOW_MS);
  expect(before, 'a report well before the boundary').toBeDefined();
  expect(after, 'a report well after the boundary').toBeDefined();
  const gained = (after!.position - before!.position) * 1000;
  const passed = after!.at - before!.at;
  expect(Math.abs(gained - passed), `gained ${gained} ms in ${passed} ms`).toBeLessThanOrEqual(
    MAX_TRACK_SLACK_MS,
  );
  test.info().annotations.push({
    type: 'boundary',
    description: `gained ${gained.toFixed(0)} ms in ${passed.toFixed(0)} ms`,
  });
});
