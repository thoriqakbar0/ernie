import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: true,
    outDir: '.build/renderer',
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
    },
  },
});
