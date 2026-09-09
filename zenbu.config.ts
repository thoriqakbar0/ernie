import { defineConfig, defineBuildConfig } from "@zenbujs/core/config"
import { Schema } from "effect"
import { readFileSync } from "node:fs"
import path from "node:path"

const release = Schema.decodeUnknownSync(
  Schema.Struct({ branch: Schema.String, target: Schema.String }),
)(JSON.parse(readFileSync(new URL("release.json", import.meta.url), "utf-8")))
if (
  !/^[\w.-]+\/[\w.-]+$/u.test(release.target) ||
  !/^[a-zA-Z0-9][\w/-]*$/u.test(release.branch) ||
  ["main", "master"].includes(release.branch)
) {
  throw new Error("Invalid dedicated release destination")
}

const dbOverride = process.env.ERNIE_ZENBU_DB
const browserDevelopment = process.env.ERNIE_RENDERER_MODE === "server"
if (dbOverride && !path.isAbsolute(dbOverride)) {
  throw new Error("ERNIE_ZENBU_DB must be an absolute path")
}

export default defineConfig({
  // Build pipeline for `zen build:source` (mirror staging) and
  // `zen build:electron` (packaged .app via electron-builder).
  // release.json owns the dedicated distribution branch; see docs/releasing.md.
  build: defineBuildConfig({
    ignore: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "src/browser/**",
      "src/integration/**",
      "src/dev-only/**",
    ],
    include: [
      "src/**/*",
      "docs/**/*",
      ".agents/skills/iterate-ernie/**/*",
      ".agents/skills/ernie-skill/**/*",
      "build/brand/**/*",
      "electron-builder.json",
      ".gitignore",
      ".npmrc",
      "package.json",
      "release.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "zenbu.config.ts",
      "zenbu.plugin.ts",
      "zenbu.plugins.jsonc",
      "vite.config.ts",
      "doctor.config.json",
    ],
    mirror: release,
    out: ".zenbu/build/source",
    // Zenbu embeds this toolchain in built apps. Local development uses Nub.
    packageManager: { type: "pnpm", version: "10.33.0" },
    // The .app's "host version" comes from `package.json#version` —
    // read at build time and baked into <bundle>/host.json. Bump
    // `package.json#version` every time you ship a new .app build.
    // Each commit's `package.json#zenbu.host` semver range is checked
    // against that value during first-install source selection.
    // Zenbu 0.6 does not update existing installations automatically.
    source: ".",
  }),
  db: dbOverride ?? "./.zenbu/db",

  pluginsFiles: "./zenbu.plugins.jsonc",

  // Boot-window HTML. The single ui entrypoint for the whole app.
  uiEntrypoint: browserDevelopment ? "./src/browser" : "./src/renderer",
})
