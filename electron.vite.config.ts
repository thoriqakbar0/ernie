import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

function rendererPort(value: string | undefined): number {
  const parsed = value === undefined ? 5_173 : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 65_535 ? parsed : 5_173;
}

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
      port: rendererPort(process.env["ERNIE_RENDERER_PORT"]),
      strictPort: true,
    },
  },
});
