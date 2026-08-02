import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/server/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
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
