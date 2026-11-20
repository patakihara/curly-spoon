import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // web's tests render JSX; this keeps the transform independent of which tsconfig esbuild finds.
  esbuild: { jsx: 'automatic' },
  test: {
    include: [
      'design-codegen/src/**/*.test.ts',
      'schema/**/*.test.ts',
      'server/src/**/*.test.ts',
      'server/e2e/**/*.test.ts',
      'web/src/**/*.test.{ts,tsx}',
    ],
    // Timing tests run on their own, after these (vitest.timing.config.ts). Privileged tests need
    // root and CAP_SYS_ADMIN, so they run in CI's privileged job, inside the image (node:test).
    exclude: [...configDefaults.exclude, '**/*.timing.test.ts', '**/*.privileged.test.ts'],
    environment: 'node',
    globals: false,
  },
});
