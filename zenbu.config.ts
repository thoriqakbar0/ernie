import {
  defineConfig,
  definePlugin,
  defineBuildConfig,
} from "@zenbujs/core/config"

export default defineConfig({
  // Boot-window HTML. The single ui entrypoint for the whole app.
  uiEntrypoint: "./src/renderer",

  // Plugins are pure main-process: services + optional schema/preload/events.
  // The "host plugin" is just the first entry by convention.
  plugins: [
    definePlugin({
      name: "app",
      services: ["./src/main/services/*.ts"],
    }),
  ],

  // Build pipeline for `zen build:source` (mirror staging) and
  // `zen build:electron` (signed .app via electron-builder). Set
  // `mirror.target` to "<owner>/<repo>" before shipping.
  build: defineBuildConfig({
    // Zenbu embeds this toolchain in built apps. Local development uses Nub.
    packageManager: { type: "pnpm", version: "10.33.0" },
    // The .app's "host version" comes from `package.json#version` —
    // read at build time and baked into <bundle>/host.json. Bump
    // `package.json#version` every time you ship a new .app build.
    // Each commit's `package.json#zenbu.host` semver range is checked
    // against that value at launch (and from `UpdaterService.update()`);
    // incompatible commits are skipped, so older .apps stay pinned to
    // source they can actually run.
    source: ".",
    out: ".zenbu/build/source",
    include: [
      "src/**/*",
      ".gitignore",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "zenbu.config.ts",
      "vite.config.ts",
      "doctor.config.json",
    ],
    ignore: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/*.spec.ts",
      "src/**/*.spec.tsx",
      "src/dev-only/**",
    ],
    mirror: { target: "thoriqakbar0/ernie", branch: "main" },
  }),
})
