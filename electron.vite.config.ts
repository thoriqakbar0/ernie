import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve("src/main/index.ts") } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        output: { format: "cjs", entryFileNames: "index.cjs" },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    build: { rollupOptions: { input: resolve("src/renderer/index.html") } },
    server: {
      port: 5_173,
      strictPort: true,
      proxy: {
        "/__agentation": {
          target: "http://127.0.0.1:4748",
          rewrite: (path) => path.replace(/^\/__agentation/u, ""),
        },
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
