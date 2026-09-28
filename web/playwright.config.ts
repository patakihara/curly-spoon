import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

/**
 * Browser tests against the app as the container serves it. With AURALIS_URL set (CI boots the
 * image and points it here) they run against that; otherwise this builds web and starts the
 * server on web's build output, the way the Dockerfile does.
 */
const webDir = dirname(fileURLToPath(import.meta.url));
const external = process.env.AURALIS_URL;
const port = 8788;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  outputDir: 'test-results',
  forbidOnly: process.env.CI !== undefined,
  reporter:
    process.env.CI !== undefined
      ? [['list'], ['junit', { outputFile: 'reports/junit/e2e.xml' }]]
      : 'list',
  use: { baseURL: external ?? `http://127.0.0.1:${port}` },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  ...(external === undefined && {
    webServer: {
      command: 'pnpm --filter @auralis/web build && node_modules/.bin/tsx src/main.ts',
      cwd: join(webDir, '..', 'server'),
      url: `http://127.0.0.1:${port}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(port),
        HOST: '127.0.0.1',
        DATA_DIR: mkdtempSync(join(tmpdir(), 'auralis-e2e-')),
        WEB_DIST_DIR: join(webDir, 'dist'),
      },
    },
  }),
});
