import { type ChildProcess, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build, type Rollup } from 'vite';
import { type PlaybackPlan, type createPlayer } from '../src/playback';

/**
 * The web player engine in Chromium, playing the recorded four-file book from the server on
 * recorded upstreams (`pnpm --filter @auralis/server e2e:serve`, as the emulator's tests run it):
 * a real sign-in, a real plan and the server's own range proxy, each file a 5 s stand-in tone.
 * The engine has no page yet, so it is bundled as it is and run on the server's origin, where the
 * session cookie reaches its requests.
 */

/** A file ending and the next one playing, further apart than this, is a pause you hear. */
const MAX_GAP_MS = 150;

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
    const positions: number[] = [];
    const { createPlayer: create } = (
      window as unknown as { AuralisPlayback: { createPlayer: typeof createPlayer } }
    ).AuralisPlayback;
    const player = create(plan, {
      createAudio: () => {
        const audio = new Audio();
        for (const type of ['playing', 'ended'])
          audio.addEventListener(type, () =>
            events.push({ type, src: new URL(audio.src).pathname, at: performance.now() }),
          );
        return audio;
      },
      onPosition: (position) => positions.push(position),
    });
    const second = plan.tracks[1]!.url;
    await player.play();
    // On past the boundary, until the second file has played a second of its own.
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('the second file never played')), 30_000);
      const poll = setInterval(() => {
        if (player.position >= plan.tracks[1]!.offset + 1) {
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

  expect(run.positions.length).toBeGreaterThan(10);
  expect([...run.positions].sort((a, b) => a - b)).toEqual(run.positions);
  expect(run.positions.some((p) => p > 0 && p < run.offset)).toBe(true);
  expect(run.positions.some((p) => p >= run.offset)).toBe(true);
  expect(run.last).toBeGreaterThanOrEqual(run.offset + 1);
});
