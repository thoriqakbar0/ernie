<!-- Cached upstream reference; verify against installed APIs. -->

# Overview

Source: https://zenbulabs.mintlify.app/api-reference/overview

## Packages

| Package                  | Description                                          |
| ------------------------ | ---------------------------------------------------- |
| `@zenbujs/core/runtime`  | Service base class and runtime.                      |
| `@zenbujs/core/services` | Built-in core services (Window, DB, RPC, HTTP, etc). |
| `@zenbujs/core/config`   | `defineConfig`, `definePlugin`, `defineBuildConfig`. |
| `@zenbujs/core/db`       | Database schema authoring (`createSchema`, `z`).     |
| `@zenbujs/core/advice`   | Advice types and helpers.                            |
| `@zenbujs/core/react`    | React hooks for the renderer.                        |
| `create-zenbu-app`       | CLI scaffolding tool.                                |

## Runtime

```typescript theme={null}
import { Service } from "@zenbujs/core/runtime"
```

## Config

```typescript theme={null}
import { defineConfig, definePlugin, defineBuildConfig } from "@zenbujs/core/config"
```

## Database

```typescript theme={null}
import { createSchema, z } from "@zenbujs/core/db"
```

## React hooks

```typescript theme={null}
import {
  useDb,
  useDbClient,
  useCollection,
  useRpc,
  useEvents,
  useViewArgs,
} from "@zenbujs/core/react"
```

## CLI

```bash theme={null}
# Create a new app
npx create-zenbu-app

# Dev server with hot reload
pnpm run dev

# Regenerate types
pnpm run link

# Generate a database migration
pnpm run db:generate

# Build for production
pnpm run build:source
pnpm run build:electron
```
