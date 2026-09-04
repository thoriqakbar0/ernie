import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import stylex from "@stylexjs/unplugin"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const browserHmrSentinel = process.env.ERNIE_BROWSER_HMR_SENTINEL
if (browserHmrSentinel && !path.isAbsolute(browserHmrSentinel)) {
  throw new Error("ERNIE_BROWSER_HMR_SENTINEL must be an absolute path")
}

export default defineConfig({
  root: path.resolve(__dirname, "src", "renderer"),
  plugins: [stylex.vite({ useCSSLayers: { before: ["reset"] } }), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src", "renderer"),
      "@ernie-hmr-sentinel": browserHmrSentinel
        ?? path.resolve(__dirname, "src", "browser", "hmr-sentinel.ts"),
    },
  },
})
