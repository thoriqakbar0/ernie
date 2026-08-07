# Ernie Dev

Ernie Dev is an Electron workbench for Prime Agent. It runs the bundled Prime Agent runtime in `--mode rpc`, discovers Git worktrees, and renders root and read-only subagent sessions as live structured transcripts in React.

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
- `src/renderer/src/App.tsx` — React workbench and conversation state.
- `src/renderer/src/WorkspaceChrome.tsx` — worktree tabs, chooser, management surfaces, and read-only session views.
- `src/renderer/src/VirtualAgentExplorer.tsx` / `VirtualTranscript.tsx` — measured TanStack virtualization for large agent trees and dynamic transcripts.
- `src/renderer/src/workspaceTabs.ts` — view-only tab state; closing a tab never kills an agent.
- `src/renderer/src/transcript.ts` — message-aware transcript, delegation, tool, and IPython Execution Trail reducer.
- `src/renderer/src/DevServerPanel.tsx` — safe launcher for development servers attributed to the selected worktree; pages open only in the default browser.
- `tests/prime-agent-rpc.test.ts` — direct RPC handshake, event ordering, streaming/tool mapping, and fail-closed framing tests.
- `assets/runtime/` — pinned executable Node and Prime Agent package copied outside ASAR.

The development-server launcher performs immediate, best-effort process/CWD revalidation before opening an exact numeric loopback URL. It is not a network isolation boundary; pages remain outside Ernie in the user's default browser.

The renderer is sandboxed with context isolation enabled, Node integration disabled, no webview support, navigation/popups/permissions/downloads denied, schema-decoded IPC, and a restrictive CSP.

## License

Ernie Dev is available under the [MIT License](LICENSE). Portions are adapted from [T3 Code](https://github.com/pingdotgg/t3code); see [NOTICE](NOTICE) for attribution and license terms.
