# Ernie Dev

Ernie Dev is an Electron workbench for Prime Agent. It runs the bundled Prime Agent runtime in `--mode rpc`, renders structured text/tool/lifecycle events in React, and mounts the official [`agentation`](https://github.com/benjitaylor/agentation) component directly in the renderer.

There is no terminal scraping, Native SDK layer, native annotation adapter, fabricated selector, or global Prime Agent dependency.

## Develop

Requirements: Apple silicon macOS, Node 24+, pnpm, and a local Prime Agent installation.

```sh
pnpm install
pnpm runtime:vendor
pnpm dev
```

The runtime binaries are generated rather than stored in Git: the pinned Node executable is larger than GitHub's per-file limit, and the dereferenced Prime Agent package is several hundred megabytes. `pnpm runtime:vendor` copies the active Node and Prime Agent installations into `assets/runtime/` and records their versions in `assets/runtime/VERSIONS`.

The app targets `/Users/thor/work/ernie` by default. Override it without exposing filesystem authority to the renderer:

```sh
ERNIE_PROJECT_PATH=/path/to/project pnpm dev
```

The Electron binary installer can leave an incomplete macOS bundle under newer Node releases. `pnpm dev` first runs the repair/verification procedure adapted from T3Code:

```sh
pnpm ensure:electron
```

## Agentation

Ernie mounts the official `<Agentation />` component in its React tree. DOM selection, element paths, bounding boxes, comments, and the Agentation toolbar therefore come from the upstream package rather than Ernie-specific targeting code.

Start the official sync server when shared/persisted sessions are wanted:

```sh
pnpm dlx agentation-mcp server
```

The renderer connects only to `http://127.0.0.1:4747`. **Send to Agent** passes Agentation's official Markdown output directly to the active Prime Agent session through the narrow preload API.

## Validate and package

```sh
pnpm typecheck
pnpm test:unit
pnpm check
pnpm package:mac
```

The unsigned local package is created at:

```text
dist/mac-arm64/Ernie Dev.app
```

Prime Agent credentials are never bundled. The app reuses the user's normal Prime Agent configuration.

## Architecture

- `src/main/PrimeAgentRpc.ts` — Effect service for the pinned RPC child, strict LF/UTF-8/JSON framing, request correlation, lifecycle, state, cleanup, and typed failures.
- `src/main/ErnieWindow.ts` — Effect-owned Electron window and security boundary.
- `src/main/ErnieApp.ts` — scoped application program and schema-decoded IPC handlers.
- `src/main/index.ts` — Layer composition root, following T3Code's Effect-based desktop structure.
- `src/preload/index.ts` — sandbox-compatible CJS preload exposing only state, commands, and event subscription.
- `src/renderer/src/App.tsx` — React workbench plus official Agentation component.
- `tests/prime-agent-rpc.test.ts` — direct RPC handshake, event ordering, streaming/tool mapping, and fail-closed framing tests.
- `assets/runtime/` — pinned executable Node and Prime Agent package copied outside ASAR.

The renderer is sandboxed with context isolation enabled, Node integration disabled, no webview support, navigation/popups/permissions/downloads denied, schema-decoded IPC, and a restrictive CSP.
