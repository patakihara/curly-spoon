import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * `pnpm dev` proxies `/api` to the BFF (default `http://localhost:8787`,
 * override with `VITE_DEV_API_PROXY_TARGET`) so the app can be developed
 * against `vite`'s fast dev server while still talking to the real Fastify
 * process — in production the BFF serves this app's build directly, same
 * origin, no proxy involved (see apps/server/src/static.ts).
 */
const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:8787';

export default defineConfig({
  root: here,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // we call registerSW() ourselves (src/pwa/registerServiceWorker.ts)
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-192.png',
        'icons/icon-maskable-512.png',
      ],
      manifest: {
        id: '/',
        name: 'Auralis',
        short_name: 'Auralis',
        description: 'Your Audiobookshelf, podcast and music client.',
        theme_color: '#B8683C',
        background_color: '#1B1410',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The offline app shell: precache the built JS/CSS/HTML/icons.
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Belt-and-braces on top of "we never add a caching rule for /api": makes
        // the "never cache API responses or audio ranges" requirement an explicit,
        // auditable line rather than an absence to infer.
        runtimeCaching: [
          {
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    /**
     * `build.rollupOptions.output.manualChunks` was tried here (phase 10, entry-chunk
     * work — docs/ROADMAP.md §10) and deliberately reverted, not merely left undone.
     * Splitting `react`/`@mantine`/`@tanstack`/`zustand` into their own vendor chunks
     * measured **zero** first-paint benefit — every one of those packages is still on
     * the entry critical path (the onboarding/setup screen Lighthouse audits needs
     * React and Mantine's base components before it can render at all), so five
     * smaller chunks are still five chunks the browser must fetch and parse before
     * anything paints; a same-build Lighthouse comparison came back with the mobile
     * score and every timing metric unchanged within noise.
     *
     * Worse, it actively broke `scripts/bundle-budget.mjs`'s measurement: that script
     * (not owned by this wave — see its own header) treats only the `<script
     * type="module">` tag in `index.html` as "entry"; it has no notion of the
     * `<link rel="modulepreload">` tags Vite emits for each vendor chunk, which the
     * browser fetches and blocks on just as eagerly. With manualChunks on, "entry, raw"
     * read as an artificially tiny ~330 KB (only the leftover app-code chunk), while
     * the always-loaded ~190 KB React chunk got bucketed as a "lazy" chunk and blew
     * through the 60 KB accidental-whole-library-import guard that budget exists to
     * enforce — a real dependency, misread as a page-specific mistake. A manualChunks
     * split may still be worth doing purely for redeploy cache-hit-rate, but it needs
     * `bundle-budget.mjs` updated to treat `modulepreload` links as entry first; that
     * script is out of this wave's scope, so the split stays out too rather than ship
     * a config that quietly lies to its own budget.
     */
  },
});
