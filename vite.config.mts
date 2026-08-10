import { resolve } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __ENABLE_AGENTATION__: JSON.stringify(mode === 'development'),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    emptyOutDir: true,
    outDir: '.build/renderer',
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
    },
  },
}));
