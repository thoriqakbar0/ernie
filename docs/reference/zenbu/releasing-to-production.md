<!-- Cached upstream reference; verify against installed APIs. -->

# Releasing to Production
Source: https://zenbulabs.mintlify.app/guides/production



A Zenbu.js app ships in two pieces:

* **The Electron app.** A small `.app` that contains a launcher and a bundled package manager. This is what the user installs.
* **A git repository (the mirror).** A separate git repository that mirrors your development repo. It contains only the files needed to run the app. On first launch the Electron app clones the mirror, and on subsequent launches it pulls the latest version.

Because the source lives in a separate repository, you can push updates without rebuilding or re-distributing the Electron app. Auto-updates can be implemented through git pulls, so shipping a new version is as fast as pushing a commit.

## Build config

The build is configured inside `zenbu.config.ts` using `defineBuildConfig`:

```typescript zenbu.config.ts theme={null}
import {
  defineConfig,
  definePlugin,
  defineBuildConfig,
} from "@zenbujs/core/config";

export default defineConfig({
  // ...
  build: defineBuildConfig({
    include: [
      "src/**/*",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "zenbu.config.ts",
      "vite.config.ts",
    ],
    ignore: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    mirror: {
      target: "your-org/your-app",
      branch: "main",
    },
  }),
});
```

### include and ignore

`include` is an array of glob patterns that determines which files from your project end up in the staged source. Everything else is excluded. Use `ignore` to filter out files that match an include pattern but shouldn't ship, like tests or dev-only code.

### Transforms

Build plugins let you transform files during staging or emit new files. Each plugin receives every file and can modify its contents, drop it entirely, or leave it unchanged.

```typescript theme={null}
import { defineBuildConfig } from "@zenbujs/core/config";
import type { BuildPlugin } from "@zenbujs/core/config";

const injectLicense: BuildPlugin = {
  name: "inject-license",
  done(ctx) {
    ctx.emit("LICENSE", "MIT License\n...");
  },
};

export default defineBuildConfig({
  // ...
  plugins: [injectLicense],
});
```

A build plugin can define a `transform(path, contents)` function that runs on each file. Returning a string replaces the file's contents, returning `null` drops the file, and returning nothing leaves it as-is. The `done` function runs after all files are processed and can emit additional files with `ctx.emit()`.

## Git repository

Any git remote works as the source repository, for example GitHub, GitLab, or a self-hosted server.

When the user launches the app for the first time, the Electron app clones this repository into `~/.zenbu/<app-name>/`. On subsequent launches, it fetches the latest commits and checks out the most recent compatible version. This is also how updates are delivered: push new source to the mirror, and users pick it up on their next launch.

The staged source is published to the mirror with:

```bash theme={null}
# First time
pnpm run publish:source init

# Subsequent pushes
pnpm run publish:source push
```

## Host version

The Electron app's version number comes from `package.json#version`. `zen build:electron` reads it at build time and bakes it into the `.app` so subsequent `git pull`s of the source can't change it. Bump `package.json#version` whenever you ship a new `.app`.

The source declares which Electron app versions it's compatible with through a semver range in the same `package.json`:

```json package.json theme={null}
{
  "version": "0.0.6",
  "zenbu": {
    "host": ">=0.0.0 <0.1.0"
  }
}
```

When the launcher fetches new source, it checks whether the latest commit is compatible with the installed Electron app. If it is, it checks out that commit. If not, it searches backwards through the git history to find the most recent compatible commit. This means you can push source that requires a newer Electron app without breaking users who haven't updated yet.

## Package manager

The Electron app bundles a package manager that runs `install` on first launch and whenever the lockfile changes. By default it bundles pnpm, but you can change it in the build config:

```typescript theme={null}
defineBuildConfig({
  // ...
  packageManager: { type: "bun", version: "1.3.12" },
});
```

Supported options are `pnpm`, `npm`, `yarn`, and `bun`. The specified version is downloaded and cached during `zen build:electron`, then packaged into the `.app` bundle so the user's machine doesn't need a package manager installed.

## Installing screen

The first launch requires cloning the source and installing dependencies, which can take a few seconds. You can provide an `installing.html` file that the launcher shows during this process.

Drop it next to your renderer entry:

```
src/renderer/
├─ index.html
├─ main.tsx
└─ installing.html
```

`zen build:electron` picks it up automatically. The page receives progress events through a small API exposed on `window.zenbuInstall`:

```html installing.html theme={null}
<!doctype html>
<html>
  <head>
    <style>
      body {
        background: #111;
        color: #e5e5e5;
        font-family: system-ui, sans-serif;
      }
      .progress {
        width: 280px;
        height: 4px;
        background: #222;
        border-radius: 2px;
        overflow: hidden;
      }
      .bar {
        background: #6a59ff;
        height: 100%;
        transition: width 200ms;
      }
    </style>
  </head>
  <body>
    <div id="step">Starting...</div>
    <div class="progress"><div class="bar" id="bar"></div></div>
    <script>
      window.zenbuInstall.on("step", ({ label }) => {
        document.getElementById("step").textContent = label;
      });
      window.zenbuInstall.on("progress", ({ ratio }) => {
        if (ratio != null)
          document.getElementById("bar").style.width = `${ratio * 100}%`;
      });
      window.zenbuInstall.on("error", ({ message }) => {
        document.getElementById("step").textContent = message;
      });
    </script>
  </body>
</html>
```

The available events are:

| Event      | Payload                                                               |
| ---------- | --------------------------------------------------------------------- |
| `step`     | `{ id: "clone" \| "fetch" \| "install" \| "handoff", label: string }` |
| `message`  | `{ text: string }`                                                    |
| `progress` | `{ phase?: string, loaded?: number, total?: number, ratio?: number }` |
| `done`     | `{ id: string }`                                                      |
| `error`    | `{ id?: string, message: string }`                                    |

The window closes automatically once the app is ready. This screen only runs in production. It never appears during development.

## Building

There are two build steps:

```bash theme={null}
# 1. Stage source files (apply include/ignore/transforms)
pnpm run build:source

# 2. Build the Electron binary
pnpm run build:electron
```

`build:source` walks your project, applies the include and ignore patterns, runs any transform plugins, and writes the staged output. `build:electron` bundles the launcher, the toolchain, and the installing screen into an Electron `.app` using electron-builder.

You can pass flags through to electron-builder:

```bash theme={null}
pnpm run build:electron -- --mac dmg
pnpm run build:electron -- --publish always
```


