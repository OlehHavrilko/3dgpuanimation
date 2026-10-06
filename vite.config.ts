import { defineConfig } from 'vite';
import { serviceWorker } from './scripts/pwa-plugin.ts';

export default defineConfig({
  base: './',
  server: { host: true },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
