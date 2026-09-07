<!-- Cached upstream reference; verify against installed APIs. -->

# Quickstart
Source: https://zenbulabs.mintlify.app/quickstart



<Steps>
  <Step title="Scaffold the project">
    <Tabs>
      <Tab title="npm">
        ```bash theme={null}
        npx create-zenbu-app my-app
        ```
      </Tab>

      <Tab title="pnpm">
        ```bash theme={null}
        pnpx create-zenbu-app my-app
        ```
      </Tab>

      <Tab title="yarn">
        ```bash theme={null}
        yarn dlx create-zenbu-app my-app
        ```
      </Tab>

      <Tab title="bun">
        ```bash theme={null}
        bunx create-zenbu-app my-app
        ```
      </Tab>
    </Tabs>

    This creates a new directory with everything you need to get started.
  </Step>

  <Step title="Install dependencies">
    <Tabs>
      <Tab title="pnpm">
        ```bash theme={null}
        cd my-app && pnpm install
        ```
      </Tab>

      <Tab title="npm">
        ```bash theme={null}
        cd my-app && npm install
        ```
      </Tab>

      <Tab title="yarn">
        ```bash theme={null}
        cd my-app && yarn
        ```
      </Tab>

      <Tab title="bun">
        ```bash theme={null}
        cd my-app && bun install
        ```
      </Tab>
    </Tabs>
  </Step>

  <Step title="Start the app">
    <Tabs>
      <Tab title="pnpm">
        ```bash theme={null}
        pnpm run dev
        ```
      </Tab>

      <Tab title="npm">
        ```bash theme={null}
        npm run dev
        ```
      </Tab>

      <Tab title="yarn">
        ```bash theme={null}
        yarn dev
        ```
      </Tab>

      <Tab title="bun">
        ```bash theme={null}
        bun run dev
        ```
      </Tab>
    </Tabs>

    Your app will open in a new window, and any changes you make will hot-reload.
  </Step>
</Steps>

## Project structure

After scaffolding, your project looks like this:

```
my-app/
├── zenbu.config.ts       # The only required config file
├── package.json
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main/
    │   └── services/
    │       ├── init.ts   # Opens the main window on boot
    │       └── cwd.ts    # RPC service that returns process.cwd()
    └── renderer/
        ├── index.html
        ├── main.tsx
        └── App.tsx
```

The `zenbu.config.ts` file is the entry point. It tells Zenbu.js where everything in your project is.

```typescript zenbu.config.ts theme={null}
import { defineConfig, definePlugin } from "@zenbujs/core/config"

export default defineConfig({
  uiEntrypoint: "./src/renderer",
  plugins: [
    definePlugin({
      name: "app",
      services: ["./src/main/services/*.ts"],
    }),
  ],
})
```

Add a `schema: "./src/main/schema.ts"` field to the plugin when you're ready to introduce a database. The top-level `db` field is optional and defaults to `./.zenbu/db`.

## Available scripts

| Script                    | What it does                                            |
| ------------------------- | ------------------------------------------------------- |
| `pnpm run dev`            | Run the app locally with hot reloading.                 |
| `pnpm run link`           | Regenerate types after changing your project structure. |
| `pnpm run db:generate`    | Create a migration after changing your database schema. |
| `pnpm run build:source`   | Stage the source tree for publishing.                   |
| `pnpm run build:electron` | Produce a signed `.app` / installer.                    |

## Next steps

<CardGroup>
  <Card title="Concepts" icon="book" href="/concepts">
    Learn the plugin model, state, and RPC.
  </Card>
</CardGroup>
