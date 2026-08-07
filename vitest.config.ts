import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/server/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      // Added for wave 12f-2's `QueueView.test.tsx` — the first `.tsx` unit test in the repo.
      // It imports `QueueView.tsx` (which contains JSX) but renders nothing itself; no
      // `jsdom`/`@testing-library/react` is installed anywhere in this workspace (checked
      // before adding this line), so this glob only ever needs to pick up pure-logic tests
      // that happen to live in a `.tsx` file alongside the component they test, not a general
      // invitation to write DOM-rendering tests without first adding that tooling.
      'apps/web/src/**/*.test.tsx',
    ],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'apps/server/src/**', 'apps/web/src/**'],
      // `testSupport/` is the harness itself (the fake Audiobookshelf and the
      // test app builder), not product code — counting it would inflate the
      // number with lines that exist only to exercise other lines.
      exclude: ['**/*.test.ts', '**/index.ts', '**/*.d.ts', '**/testSupport/**'],
    },
  },
});
