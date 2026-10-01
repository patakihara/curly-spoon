import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The app, the Sonora gallery the screenshot test visits (src/gallery.tsx), and the states
    // fixture the states test visits (src/states.tsx).
    rollupOptions: {
      input: {
        main: page('index.html'),
        gallery: page('gallery.html'),
        states: page('states.html'),
      },
    },
  },
  // In development the server runs separately on 8787; production serves both on one origin.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
