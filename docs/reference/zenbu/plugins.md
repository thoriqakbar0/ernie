<!-- Cached upstream reference; verify against installed APIs. -->

# Plugins
Source: https://zenbulabs.mintlify.app/core/plugins



Every Zenbu.js application is itself a plugin. Your app is defined with `definePlugin()` the same way any third-party extension would be, and it has the same capabilities. The only thing that makes the main application special is the `uiEntrypoint` in `defineConfig()`, which tells the framework which plugin's code to load in the renderer process first.

## Defining a plugin

Plugins are declared with `definePlugin()` from `@zenbujs/core/config`:

```typescript zenbu.config.ts theme={null}
import { defineConfig, definePlugin } from "@zenbujs/core/config"

export default defineConfig({
  db: "./.zenbu/db",
  uiEntrypoint: "./src/renderer",
  plugins: [
    definePlugin({
      name: "app",
      services: ["./src/main/services/*.ts"],
      schema: "./src/main/schema.ts",
      events: "./src/main/events.ts",
      migrations: "./migrations",
      icons: {
        "my-view": '<svg ...>...</svg>',
      },
    }),
  ],
})
```

| Field        | Required | Description                                                                                                                                                                                                                                       |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | yes      | Unique plugin identifier. Used as the top-level namespace for the plugin's database section, RPC services, and events (e.g. `db.<name>`, `rpc.<name>.<service>`, `events.<name>.<event>`). Reserved value: `core` belongs to the framework.       |
| `services`   | yes      | Glob patterns for main process service files.                                                                                                                                                                                                     |
| `schema`     | no       | Path to the database schema definition.                                                                                                                                                                                                           |
| `events`     | no       | Path to event type definitions.                                                                                                                                                                                                                   |
| `migrations` | no       | Directory of generated migration files.                                                                                                                                                                                                           |
| `preload`    | no       | Path to a renderer preload module.                                                                                                                                                                                                                |
| `icons`      | no       | Map of inline SVG strings keyed by [injection](/core/injections) `name`. When you call `this.inject({ name })` and a matching key exists, the framework copies the SVG into `meta.icon` for you. Lookup is per-plugin (no cross-plugin fallback). |
| `dependsOn`  | no       | Declares which other plugins this plugin needs type definitions from. See [Type dependencies](#type-dependencies).                                                                                                                                |

## Scaffolding a plugin

`create-zenbu-app` can scaffold a plugin folder from anywhere on disk:

```bash theme={null}
pnpm create zenbu-app --plugin my-plugin
```

| Flag               | Description                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `--plugin`         | Use the plugin template instead of the app template. Skips app-only prompts (Tailwind, build config).   |
| `--no-add-to-host` | Skip the interactive prompt that offers to add the new plugin to each upstream host's `plugins:` array. |
| `--no-git`         | Skip the git init prompt. Git init is auto-skipped when an ancestor already has a `.git/`.              |
| `--yes` / `-y`     | Auto-confirm every prompt with the default.                                                             |

The command scaffolds the plugin folder and installs its dependencies.

## Adding a plugin

Plugins can be inlined with `definePlugin()` or referenced by path to a `zenbu.plugin.ts` file:

```typescript theme={null}
plugins: [
  definePlugin({ name: "app", services: ["./src/main/services/*.ts"] }),
  "./plugins/devtools/zenbu.plugin.ts",
]
```

Adding or removing a plugin in `zenbu.config.ts` is a hot-reloadable change that takes effect without restarting the app.

## Local-only plugins (`localPlugins`)

A `zenbu.config.ts` can opt into a per-developer overlay file that's gitignored and loaded only if it exists. Use this when you want to wire a local plugin (e.g. one cloned into `~/.zenbu/plugins/...`) into your app without committing the path:

```typescript theme={null}
export default defineConfig({
  uiEntrypoint: "./src/renderer",
  plugins: [
    "./plugins/app/zenbu.plugin.ts",
  ],
  localPlugins: "./zenbu.local.ts", // gitignored; optional
})
```

```typescript zenbu.local.ts theme={null}
import type { LocalPluginsDefault } from "@zenbujs/core/config"

const plugins: LocalPluginsDefault = [
  "/Users/me/.zenbu/plugins/the-browser-plugin/zenbu.plugin.ts",
  // or an inline definePlugin({...})
]
export default plugins
```

Rules:

* The default export is a plugin entry, or an array of entries. Same shape as `plugins`.
* Relative paths inside the overlay anchor to the **overlay file's** directory, not the project root.
* `localPlugins` accepts a single string or an array of strings (multiple overlays).
* If the overlay file doesn't exist, the field is silently ignored.
* Editing the overlay file hot-reloads exactly like editing `zenbu.config.ts`.
* `zen build:source` / `zen build:electron` / `zen publish:source` **skip** `localPlugins` entirely, so a developer's overlay can never ship in a build artefact.

## Plugin capabilities

A plugin has the same capabilities as the host application:

* **Services** run in the main process and expose methods via RPC.
* **Database schemas** define sections of the shared database.
* **Events** can be emitted and listened to across plugins.
* **[Injections](/core/injections)** are the unified renderer-side surface. One primitive (`this.inject(...)` / `useRegisterInjection(...)`) covers React components other plugins can render via `<View>`, plain side-effect modules (the old "content script" pattern), plain functions/values, and [advice](/core/advice) (sugar for wrapping or replacing an existing export).

## Type dependencies

If a plugin needs to call another plugin's RPC methods, read its database, or subscribe to its events, it needs that plugin's type definitions. You declare this with `dependsOn`:

```typescript zenbu.plugin.ts theme={null}
import { definePlugin } from "@zenbujs/core/config"

export default definePlugin({
  name: "devtools",
  services: ["./src/main/services/*.ts"],
  dependsOn: [
    { name: "app", from: "../../zenbu.config.ts" },
  ],
})
```

`name` is the plugin you depend on, and `from` is the path to the file that defines it. With this in place, you get typed access to that plugin's API:

```typescript theme={null}
// Read app's database
const count = useDb(root => root.app.count)

// Call app's RPC methods
const rpc = useRpc()
await rpc.app.counter.increment()

// Subscribe to app's events
events.app.notification.subscribe(data => { ... })
```

This is a type-only dependency. `dependsOn` tells `zen link` where to find the other plugin's service, schema, and event definitions so it can generate TypeScript types under `<plugin>/.zenbu/types/`. The generated files are `import type` pointers to the actual source on disk, and the entire `.zenbu/types/` directory is gitignored.

`zen link` runs automatically inside `zen dev`. Outside dev, run it manually before typechecking:

```bash theme={null}
zen link
```
