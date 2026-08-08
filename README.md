# Ernie Dev

Ernie Dev is a secure, multi-directory Electron workbench for Prime Agent. It presents independent **Spaces** and **Agents** inventories, preserves Space-local session tabs, and combines interactive owned runtimes with read-only attachment to discovered root and subagent sessions.

An empty Space opens a functional start surface with a first prompt, provider-qualified model selection, and an RLM max-depth selector. Depth defaults to `0` (root only); custom non-negative depths are supported. Development builds also include React Grab for source-aware interface feedback.

There is no terminal scraping, Native SDK layer, or global Prime Agent dependency.

## Develop

Requirements: Apple silicon macOS, Node 24+, pnpm, and a local Prime Agent installation.

```sh
pnpm install
pnpm runtime:vendor
pnpm dev
```

If port `5173` is already occupied, choose another loopback renderer port without stopping the existing service:

```sh
ERNIE_RENDERER_PORT=5174 pnpm dev
```

The runtime binaries are generated rather than stored in Git: the pinned Node executable is larger than GitHub's per-file limit, and the dereferenced Prime Agent package is several hundred megabytes. `pnpm runtime:vendor` copies the active Node and Prime Agent installations into `assets/runtime/` and records their versions in `assets/runtime/VERSIONS`.

### React Grab

Development builds load [`react-grab`](https://react-grab.com) from the local dependency. Hover an element in Ernie, press **⌘C** (or **Ctrl+C**), then paste the copied component/source context into your coding agent. React Grab is excluded from production builds by the `import.meta.env.DEV` guard in `src/renderer/src/main.tsx`.

The project-local React Grab agent skill lives at `.prime/agent/skills/react-grab/SKILL.md`. No feedback server, proxy, MCP service, or dedicated port is required.

The app targets `/Users/thor/work/ernie` by default. Override it without exposing filesystem authority to the renderer:

```sh
ERNIE_PROJECT_PATH=/path/to/project pnpm dev
```

The Electron binary installer can leave an incomplete macOS bundle under newer Node releases. `pnpm dev` first runs the repair/verification procedure adapted from T3Code:

```sh
pnpm ensure:electron
```

## Runtime and window lifecycle

- Each Space owns at most one Ernie-managed Prime Agent RPC client. The selected Space path is resolved and authorized in the Electron main process; the renderer never supplies a working directory.
- Ernie keeps at most **three resident Space clients**. At capacity it evicts only the least-recently-used idle client. It never evicts a working, compacting, queued, switching, or in-flight runtime.
- Model and RLM-depth preferences are stored per Space. Prompt drafts are intentionally not persisted.
- Prime Agent `0.7.1` does not expose live RLM-depth mutation in RPC mode. Ernie applies the selected depth through `RLM_MAX_DEPTH` when creating the owned process. If the idle Space client has a different depth, Ernie safely replaces it before creating the next session, setting its model, and admitting the first prompt; the previous saved session remains discoverable.
- On macOS, `Cmd–W` closes only the window. The main-process registry and active work continue, and reopening Ernie restores the attached runtime state. `Cmd–Q` shuts down Ernie-owned RPC process trees with bounded TERM/KILL cleanup; saved Prime Agent sessions remain discoverable.
- Closing a session tab closes only its view. It does not stop or delete the underlying session.

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

- `src/main/PrimeAgentRpc.ts` — scoped adapter for one pinned RPC child, with bounded framing/backpressure, provider-qualified models, serialized mutations, and whole-process-tree cleanup.
- `src/main/SpaceRuntimeRegistry.ts` — catalog-authorized per-Space ownership, a three-client idle-LRU resource limit, Space-tagged events, and atomic depth/model/first-prompt sequencing.
- `src/main/WorkspaceCatalog.ts` — read-only Effect service joining Git worktrees with schema-decoded Prime Agent session metadata.
- `src/main/SessionTranscriptStream.ts` — read-only daemon protocol-v7 attachment for bounded selected-session snapshots and live message/tool streams.
- `src/main/DevServerCatalog.ts` — serialized, worktree-scoped discovery of allowlisted local development-server listeners.
- `src/main/ErnieWindow.ts` — Effect-owned Electron window and security boundary.
- `src/main/ErnieApp.ts` — scoped application program and schema-decoded IPC handlers.
- `src/main/index.ts` — Layer composition root, following T3Code's Effect-based desktop structure.
- `src/preload/index.ts` — sandbox-compatible CJS preload exposing Space-addressed state, commands, model/start operations, workspace/session streams, local-server actions, and bounded clipboard writes.
- `src/renderer/src/App.tsx` / `FocusedWorkspace.tsx` — independent Spaces/Agents navigation, Space-local tabs, keyed live runtime state, and development-only React Grab.
- `src/renderer/src/SpaceLaunchpad.tsx` — accessible T3-style first-thread form with functional model and RLM-depth configuration.
- `src/renderer/src/spaceSessionTabs.ts`, `transcript.ts`, `sessionTranscript.ts`, and `spaceLaunchPreferences.ts` — pure Space-local navigation, transcript, and bounded preference state.
- `tests/prime-agent-rpc.test.ts` — direct RPC handshake, event ordering, streaming/tool mapping, and fail-closed framing tests.
- `assets/runtime/` — pinned executable Node and Prime Agent package copied outside ASAR.

The development-server launcher performs immediate, best-effort process/CWD revalidation before opening an exact numeric loopback URL. It is not a network isolation boundary; pages remain outside Ernie in the user's default browser.

The renderer is sandboxed with context isolation enabled, Node integration disabled, no webview support, navigation/popups/permissions/downloads denied, schema-decoded IPC, and a restrictive CSP.

## License

Ernie Dev is available under the [MIT License](LICENSE). Portions are adapted from [T3 Code](https://github.com/pingdotgg/t3code); see [NOTICE](NOTICE) for attribution and license terms.
