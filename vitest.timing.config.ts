import { defineConfig } from 'vitest/config';

/**
 * Tests that time the code (`*.timing.test.ts`), run after the others (`pnpm test`), one file at a
 * time, so no other test competes for the machine while they measure.
 */
export default defineConfig({
  test: {
    include: ['server/src/**/*.timing.test.ts'],
    environment: 'node',
    globals: false,
    fileParallelism: false,
  },
});
