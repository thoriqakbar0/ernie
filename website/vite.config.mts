import { defineConfig } from 'vite'

export default defineConfig({
  root: 'website',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        docs: new URL('./docs/index.html', import.meta.url).pathname,
        home: new URL('./index.html', import.meta.url).pathname,
      },
    },
  },
})
