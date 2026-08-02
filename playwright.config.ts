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
 * Three projects:
 *  - `ui`    — component and design-system tests, rendered from static fixtures.
 *  - `app`   — end-to-end flows against the built web app + faked upstream servers.
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
  workers: CI ? 2 : undefined,
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
      reuseExistingServer: !CI,
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
      name: 'app',
      testDir: './e2e/app',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        launchOptions,
        baseURL: APP_URL,
      },
    },
  ],
});
