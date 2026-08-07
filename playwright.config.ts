import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * Some sandboxes ship a pre-baked Chromium under `PLAYWRIGHT_BROWSERS_PATH` whose build
 * number does not match the version Playwright expects, and re-downloading is blocked.
 * When that is the case, point Playwright at whatever build is actually on disk.
 * On CI (and any machine where `playwright install` ran) this resolves to `undefined`
 * and the default lookup applies.
 */
function preinstalledChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;

  const builds = readdirSync(root)
    .filter((entry) => /^chromium-\d+$/.test(entry))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));

  for (const build of builds) {
    const candidate = join(root, build, 'chrome-linux', 'chrome');
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = preinstalledChromium();
const launchOptions = executablePath ? { executablePath } : {};

/** Fixed port `packages/ui/gallery/vite.config.ts` also uses — see that file's comment. */
const GALLERY_URL = 'http://localhost:5174';

/**
 * The `app` project's server: the real BFF, serving the real built web app
 * (`apps/web/dist`) on its own origin — exactly the production topology
 * (docs/ARCHITECTURE.md's "one container, one port"), just against
 * `AURALIS_FAKE_UPSTREAMS=1` instead of a live Audiobookshelf, per
 * docs/ARCHITECTURE.md's testing strategy ("Full flows | Playwright | Onboarding
 * → browse → play → request"). The port is distinct from `pnpm dev`'s 8787 and
 * the gallery's 5174 so all three can run at once without colliding.
 */
const APP_URL = 'http://localhost:4310';
const APP_SESSION_SECRET = 'e2e-only-not-a-real-secret-32chars-min';

/**
 * Written by `e2e/app/onboarding.spec.ts` once it has signed in, read by every
 * other `app` spec. Must stay in step with `AUTH_STATE_PATH` in
 * `e2e/app/helpers/onboarding.ts`, which is the same file resolved from the
 * other side; a mismatch fails loudly at load, not silently.
 */
const APP_AUTH_STATE = './e2e/.auth/app-user.json';

/**
 * Five projects:
 *  - `ui-desktop`/`ui-mobile` — component and design-system tests, rendered from
 *    static fixtures.
 *  - `app-onboarding` — the flows that need a server nothing has configured yet.
 *  - `app-jellyfin-unconfigured` — the assertions that need Jellyfin not yet
 *    connected, for the same single-tenant reason one level down.
 *  - `app` — everything else, which runs after both have run.
 *
 * Mobile and desktop viewports are both exercised because the shell is adaptive:
 * the navigation and Now Playing layouts genuinely differ between them.
 *
 * `ui-desktop`/`ui-mobile` get a `baseURL` pointing at the `@auralis/ui` gallery, which
 * `webServer` boots below — so specs there can `page.goto('/')`. `harness.spec.ts`
 * doesn't need any of that (it renders fixtures via `page.setContent`), and keeps
 * working unchanged alongside a configured baseURL.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // One worker per core, measured rather than guessed. Playwright's default is
  // half the cores, and both this machine and a GitHub `ubuntu-latest` runner
  // have four — which is where the two workers everyone kept seeing came from.
  // Timed full-suite runs here on 2026-08-07: 2 workers took 8m50s, 4 took
  // 6m25s, a 27% saving. **Do not read that 4-worker run's clean sheet as
  // evidence of stability** — later runs at 4 flaked too (one
  // `requests.spec.ts` failure that passed in isolation; a separate agent saw
  // four `browse.spec.ts` failures at the auto worker count and none at
  // `--workers=1`). The confound is this box: four cores, with subagents and
  // sometimes a second session competing for them, so flakes track CPU
  // pressure rather than cleanly tracking this number. CI is green at 4, but
  // `retries: 2` there would mask exactly this.
  // The suite is not embarrassingly parallel — `app-onboarding` and
  // `app-jellyfin-unconfigured` are barriers before `app`, and the `app`
  // webServer builds the web app before it boots — so the ceiling here is the
  // dependency chain, not this number. Dial it back if CI turns intermittent:
  // the `app` project's files are order-independent, which is not the same as
  // concurrency-safe against one single-tenant stateful BFF.
  workers: '100%',
  reporter: CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      // Font rasterisation differs slightly between machines; allow a hair of drift.
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
    },
  },
  webServer: [
    {
      command: 'pnpm --filter @auralis/ui dev',
      url: GALLERY_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      // Builds the web app once, then boots the BFF to serve it — the same
      // `pnpm --filter @auralis/web build` + real server pairing the Dockerfile
      // uses, just with the fixture-backed fake upstream instead of a real
      // Audiobookshelf (apps/server/test/fakes/fakeAbs.ts).
      command:
        'pnpm --filter @auralis/web build && pnpm --filter @auralis/server exec tsx src/main.ts',
      url: `${APP_URL}/api/v1/health`,
      // Deliberately *not* reused, unlike the gallery above. This server is
      // stateful — `DATA_DIR=:memory:` means "which Audiobookshelf am I pointed
      // at" is per-process — and `e2e/app/onboarding.spec.ts` asserts on the
      // unconfigured state a fresh boot gives. Reusing a server left over from a
      // previous run would start those tests already-configured, so they'd pass
      // on CI (always fresh) and fail on the second local run. Reuse also skips
      // the `vite build` in this command, which would silently test a stale
      // bundle.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: '4310',
        DATA_DIR: ':memory:',
        SESSION_SECRET: APP_SESSION_SECRET,
        AURALIS_FAKE_UPSTREAMS: '1',
        NODE_ENV: 'test',
      },
    },
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: CI ? 'retain-on-failure' : 'off',
    colorScheme: 'dark',
    launchOptions,
  },
  projects: [
    {
      name: 'ui-desktop',
      testDir: './e2e/ui',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
        baseURL: GALLERY_URL,
      },
    },
    {
      name: 'ui-mobile',
      testDir: './e2e/ui',
      use: { ...devices['Pixel 7'], launchOptions, baseURL: GALLERY_URL },
    },
    {
      name: 'app-onboarding',
      testDir: './e2e/app',
      testMatch: /onboarding\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
        baseURL: APP_URL,
      },
    },
    {
      // Every assertion that needs Jellyfin *not* connected. Same shape as
      // `app-onboarding` one level down: Jellyfin's config row is process-global,
      // so the first spec that connects it destroys the unconfigured state for
      // every other spec. `describe.serial` cannot express this — it orders tests
      // within a file, and Playwright still runs different files on different
      // workers — which is exactly how `music.spec.ts` and `search-music.spec.ts`
      // came to race on CI. See `e2e/app/jellyfin-unconfigured.spec.ts`.
      name: 'app-jellyfin-unconfigured',
      testDir: './e2e/app',
      testMatch: /jellyfin-unconfigured\.spec\.ts$/,
      dependencies: ['app-onboarding'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
        baseURL: APP_URL,
        storageState: APP_AUTH_STATE,
      },
    },
    {
      name: 'app',
      testDir: './e2e/app',
      testIgnore: /(onboarding|jellyfin-unconfigured)\.spec\.ts$/,
      // The ordering constraints in the suite, made explicit rather than hoped
      // for. `POST /api/v1/setup` writes single-tenant server state, so the first
      // spec that signs in configures the server for every other spec sharing
      // this `webServer`; `POST /jellyfin/config` is single-tenant the same way.
      // Both unconfigured-state assertions therefore live in their own projects
      // and everything else declares a dependency on them: Playwright finishes a
      // dependency project entirely before starting this one, instead of
      // `fullyParallel` racing them. The onboarding dependency also produces
      // `storageState` — see below — so it is load-bearing twice over. Files in
      // *this* project are otherwise order-independent, and each must make its
      // own preconditions true rather than inherit them from another file.
      dependencies: ['app-onboarding', 'app-jellyfin-unconfigured'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
        baseURL: APP_URL,
        // Start signed in, from the one login `app-onboarding` performed. Not a
        // speed optimisation: `POST /auth/login` is rate limited to 10 per
        // minute per IP and all workers share an IP, so a suite that signed in
        // per test would 429 mid-run.
        storageState: APP_AUTH_STATE,
      },
    },
  ],
});
