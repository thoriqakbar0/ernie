import path from "node:path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { vite as stylex } from "@stylexjs/unplugin"

const __dirname = import.meta.dirname
const browserHmrSentinel = process.env.ERNIE_BROWSER_HMR_SENTINEL
if (browserHmrSentinel && !path.isAbsolute(browserHmrSentinel)) {
  throw new Error("ERNIE_BROWSER_HMR_SENTINEL must be an absolute path")
}

export default defineConfig({
  plugins: [
    stylex({ unstable_moduleResolution: { rootDir: __dirname, type: "commonJS" } }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src", "renderer"),
      "@ernie-hmr-sentinel":
        browserHmrSentinel ?? path.resolve(__dirname, "src", "browser", "hmr-sentinel.ts"),
    },
  },
  root: path.resolve(__dirname, "src", "renderer"),
})
