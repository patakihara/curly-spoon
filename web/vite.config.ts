import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // In development the server runs separately on 8787; production serves both on one origin.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
