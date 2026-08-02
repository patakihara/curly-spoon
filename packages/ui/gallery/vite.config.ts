import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * The gallery is both the developer playground (`pnpm --filter @auralis/ui dev`) and
 * the fixture Playwright's `ui-desktop`/`ui-mobile` projects boot against — hence the
 * fixed port, so `playwright.config.ts`'s `webServer` can point at a known URL.
 */
export default defineConfig({
  root: here,
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/gallery', import.meta.url)),
    emptyOutDir: true,
  },
});
