import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

const projectDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => {
  if (command !== "serve" || mode !== "development") {
    throw new Error("The Ernie UI lab can only run as a development server")
  }

  return {
    root: path.join(projectDirectory, "src", "dev-only", "ui-lab"),
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      open: "/?scenario=draft",
      port: 5174,
      strictPort: true,
    },
  }
})
