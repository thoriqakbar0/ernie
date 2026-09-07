import { defineConfig } from "oxlint"
import core from "ultracite/oxlint/core"
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins"
import react from "ultracite/oxlint/react"

const reactDoctor = selectJsPlugins(["react-doctor"])

export default defineConfig({
  extends: [core, react, reactDoctor],
  // Zenbu output and vendored repositories are not application source.
  ignorePatterns: [...core.ignorePatterns, "**/.zenbu", "**/.build", "repos"],
  jsPlugins: reactDoctor.jsPlugins,
  overrides: [
    {
      files: ["src/packages/app-history/index.ts", "src/host/history/source-store.ts"],
      rules: {
        // FileEntry field order is part of existing persisted checkpoint hashes.
        "sort-keys": "off",
      },
    },
    {
      files: ["src/renderer/prime-agent-state.tsx"],
      rules: {
        // Lazy state owns stable runtime clients; no replacement setter is needed.
        "react/hook-use-state": "off",
      },
    },
    {
      files: ["src/renderer/components/sidebar.tsx"],
      rules: {
        // Existing avatar identities hash the leading UTF-16 code unit, not code points.
        "unicorn/prefer-code-point": "off",
      },
    },
    {
      files: [
        "src/main/services/agents.ts",
        "src/main/services/app-history.ts",
        "src/main/services/branding.ts",
        "src/main/services/cwd.ts",
      ],
      rules: {
        // Zenbu dispatches these RPC and lifecycle entry points on service instances.
        "class-methods-use-this": [
          "error",
          { exceptMethods: ["chooseWorkspace", "request", "evaluate", "get"] },
        ],
      },
    },
    {
      files: [
        "src/host/history/source-store.ts",
        "src/renderer/components/generated-avatar.tsx",
        "src/renderer/components/sidebar.tsx",
      ],
      rules: {
        // These bit operations implement file-mode masks and persisted avatar hashes.
        "no-bitwise": "off",
      },
    },
    {
      files: ["src/packages/agents/index.ts", "src/packages/app-history/index.ts"],
      rules: {
        // Schema.TaggedError is a curried factory, not a constructor. Oxlint only
        // exempts Data.TaggedError and otherwise inserts an invalid `new` here.
        "unicorn/throw-new-error": "off",
      },
    },
  ],
  rules: {
    // Vite uses React without React Compiler; manual memoization remains necessary.
    "react-doctor/react-compiler-no-manual-memoization": "off",
    // Compiler lowering limitations do not apply to this uncompiled React app.
    "react/todo": "off",
  },
  settings: jsPluginSettings,
})
