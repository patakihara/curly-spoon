import { defineConfig } from 'vitest/config';

export default defineConfig({
  // web's tests render JSX; this keeps the transform independent of which tsconfig esbuild finds.
  esbuild: { jsx: 'automatic' },
  test: {
    include: [
      'design-codegen/src/**/*.test.ts',
      'schema/**/*.test.ts',
      'server/src/**/*.test.ts',
      'web/src/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
    globals: false,
  },
});
