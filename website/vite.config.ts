import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  // Svelte's compiler handles the icon package's conditional component exports.
  optimizeDeps: { exclude: ['phosphor-icons-svelte'] },
})
