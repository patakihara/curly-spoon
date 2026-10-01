import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build, type Rollup } from 'vite';
import { type PlaybackPlan, type createPlayer } from '../src/playback';
import { type Recorded, serveRecorded } from './recorded';

/**
 * The web player engine in Chromium, playing the recorded four-file book from the server on
 * recorded upstreams (`pnpm --filter @auralis/server e2e:serve`, as the emulator's tests run it):
 * a real sign-in, a real plan and the server's own range proxy, each file a 5 s stand-in tone the plan is timed by.
 * The engine has no page yet, so it is bundled as it is and run on the server's origin, where the
 * session cookie reaches its requests.
 */

/**
 * A file ending and the next one starting further apart than this, either way, is a pause you
 * hear (or, the other way, a skip), measured on the two elements' own media clocks. Chromium takes
 * about 90 ms to get a paused, preloaded element's audio going once `play()` is called, and fires
 * `ended` about 20 ms after a file's last sample: 113 ms here on every run, so this allows that
 * and little more.
 */
const MAX_GAP_MS = 150;

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

let recorded: Recorded | undefined;
let origin: string;
let multiFile: { source: string; id: string };
let engine: string;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  recorded = await serveRecorded();
  ({ origin, multiFile } = recorded);
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
  recorded?.stop();
});

/** One look at an element: when (page clock), its media time and source, and whether it plays. */
interface Look {
  el: number;
  at: number;
  time: number;
  src: string;
  paused: boolean;
}

/**
 * Where an element's media clock started, on the page clock: each look puts it at `at - time`,
 * and a look taken late only ever puts it later, so the earliest is the truest. Only looks well
 * under way count: an element's clock creeps for its first tenths of a second.
 */
function clockStart(looks: Look[]) {
  return Math.min(...looks.map((l) => l.at - l.time * 1000));
}

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
    const events: { type: string; src: string; el: number; duration: number }[] = [];
    const looks: Look[] = [];
    const positions: number[] = [];
    const audios: HTMLAudioElement[] = [];
    const path = (audio: HTMLAudioElement) => (audio.src === '' ? '' : new URL(audio.src).pathname);
    const look = () => {
      const at = performance.now();
      audios.forEach((audio, el) =>
        looks.push({ el, at, time: audio.currentTime, src: path(audio), paused: audio.paused }),
      );
    };
    const { createPlayer: create } = (
      window as unknown as { AuralisPlayback: { createPlayer: typeof createPlayer } }
    ).AuralisPlayback;
    const player = create(plan, {
      createAudio: () => {
        const audio = new Audio();
        const el = audios.push(audio) - 1;
        for (const type of ['playing', 'ended', 'timeupdate'])
          audio.addEventListener(type, () => {
            look();
            if (type !== 'timeupdate')
              events.push({ type, src: path(audio), el, duration: audio.duration });
          });
        return audio;
      },
      onPosition: (position) => positions.push(position),
    });
    // Each element's media time against the page clock, every frame and at every media event.
    let looking = true;
    const frame = () => {
      look();
      if (looking) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    const second = plan.tracks[1]!.url;
    await player.play();
    // On past the boundary, until the second file has played a second of its own, by its own
    // element's clock.
    const secondPlayedASecond = () => audios.some((a) => path(a) === second && a.currentTime >= 1);
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
    looking = false;
    const last = player.position;
    await player.destroy();
    return { events, looks, positions, last, second, offset: plan.tracks[1]!.offset };
  }, multiFile);

  const ended = run.events.find((e) => e.type === 'ended');
  const next = run.events.find((e) => e.type === 'playing' && e.src === run.second);
  expect(ended, 'the first file ends').toBeDefined();
  expect(ended!.src).not.toBe(run.second);
  expect(next, 'the second file plays').toBeDefined();

  // The first file's end and the second's start, each on its own element's media clock and put
  // on the page clock: the first from its last second playing, the second from its first second
  // once under way. A slow page only delays the looks, and the earliest look is kept.
  const length = ended!.duration;
  const firstLooks = run.looks.filter(
    (l) =>
      l.el === ended!.el &&
      l.src === ended!.src &&
      !l.paused &&
      l.time > length - 1 &&
      l.time < length,
  );
  const secondLooks = run.looks.filter(
    (l) => l.el === next!.el && l.src === run.second && !l.paused && l.time > 0.2 && l.time <= 1,
  );
  expect(firstLooks.length, 'looks at the first file ending').toBeGreaterThan(3);
  expect(secondLooks.length, 'looks at the second file starting').toBeGreaterThan(3);
  const gap = clockStart(secondLooks) - (clockStart(firstLooks) + length * 1000);
  test.info().annotations.push({ type: 'gap', description: `${gap.toFixed(1)} ms` });
  expect(
    Math.abs(gap),
    `the second file starts ${gap.toFixed(1)} ms after the first ends`,
  ).toBeLessThan(MAX_GAP_MS);

  // The position the engine reports runs on across the boundary and never goes back.
  expect(run.positions.length).toBeGreaterThan(10);
  expect(run.positions.some((p) => p > 0 && p < run.offset)).toBe(true);
  expect(run.positions.some((p) => p >= run.offset)).toBe(true);
  expect(run.last).toBeGreaterThanOrEqual(run.offset + 1);
  for (let i = 1; i < run.positions.length; i++) {
    const [a, b] = [run.positions[i - 1]!, run.positions[i]!];
    expect(b, `from ${a} to ${b}`).toBeGreaterThanOrEqual(a);
  }
});
