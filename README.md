# Ernie Dev

Ernie Dev is a secure Electron foundation for a Prime Agent workbench. It runs the bundled Prime Agent runtime in `--mode rpc`, discovers Git worktrees, and can attach read-only to root and subagent sessions through the local daemon.

The previous renderer interface has been intentionally removed. Development builds currently show an empty canvas with official Agentation available for shaping the replacement project-first chat experience; production builds show the empty canvas.

There is no terminal scraping, Native SDK layer, or global Prime Agent dependency.

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

## Validate and package

```sh
pnpm typecheck
pnpm test:unit
pnpm check
pnpm package:mac
```

The ad-hoc-signed local package is created at:

```text
dist/Ernie Dev.app
```

Prime Agent credentials are never bundled. The app reuses the user's normal Prime Agent configuration.

## Architecture

- `src/main/PrimeAgentRpc.ts` — Effect service for the pinned RPC child, strict LF/UTF-8/JSON framing, request correlation, lifecycle, state, cleanup, and typed failures.
- `src/main/WorkspaceCatalog.ts` — read-only Effect service joining Git worktrees with schema-decoded Prime Agent session metadata.
- `src/main/SessionTranscriptStream.ts` — read-only daemon protocol-v7 attachment for bounded selected-session snapshots and live message/tool streams.
- `src/main/DevServerCatalog.ts` — serialized, worktree-scoped discovery of allowlisted local development-server listeners.
- `src/main/ErnieWindow.ts` — Effect-owned Electron window and security boundary.
- `src/main/ErnieApp.ts` — scoped application program and schema-decoded IPC handlers.
- `src/main/index.ts` — Layer composition root, following T3Code's Effect-based desktop structure.
- `src/preload/index.ts` — sandbox-compatible CJS preload exposing only typed state, worktree/session streams, local-server actions, commands, and skills.
- `src/renderer/src/App.tsx` — intentionally empty renderer canvas with direct, development-only Agentation.
- `src/renderer/src/workspaceTabs.ts`, `transcript.ts`, and `sessionTranscript.ts` — retained pure state modules for the replacement interface.
- `tests/prime-agent-rpc.test.ts` — direct RPC handshake, event ordering, streaming/tool mapping, and fail-closed framing tests.
- `assets/runtime/` — pinned executable Node and Prime Agent package copied outside ASAR.

The development-server launcher performs immediate, best-effort process/CWD revalidation before opening an exact numeric loopback URL. It is not a network isolation boundary; pages remain outside Ernie in the user's default browser.

The renderer is sandboxed with context isolation enabled, Node integration disabled, no webview support, navigation/popups/permissions/downloads denied, schema-decoded IPC, and a restrictive CSP.

## License

Ernie Dev is available under the [MIT License](LICENSE). Portions are adapted from [T3 Code](https://github.com/pingdotgg/t3code); see [NOTICE](NOTICE) for attribution and license terms.
