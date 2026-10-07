import { defineConfig } from 'vite';
import { serviceWorker } from './scripts/pwa-plugin.ts';

export default defineConfig({
  base: './',
  server: { host: true },
  plugins: [serviceWorker()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // Two pages: the main descent and the memory branch (memory.html), sharing one engine chunk.
    rollupOptions: { input: { main: 'index.html', memory: 'memory.html' } },
  },
});
