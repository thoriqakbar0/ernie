# Ernie Dev

Ernie Dev is a secure, multi-directory Electron workbench for Prime Agent. It presents independent **Spaces** and **Agents** inventories, preserves worktree-local session tabs, supports recoverable managed-worktree workflows, and combines interactive owned runtimes with read-only attachment to discovered root and subagent sessions.

An empty worktree opens a functional start surface with a first prompt plus dedicated provider-qualified model and model-aware thinking-effort dropdowns. Thinking defaults to `low` when supported, and new threads launch at RLM depth `0` (root only). Development builds include React Grab and Agentation for source-aware and persistent visual feedback.

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

### Interface feedback tools

Development builds load [`react-grab`](https://react-grab.com) from the local dependency. Hover an element in Ernie, press **⌘C** (or **Ctrl+C**), then paste the copied component/source context into your coding agent. Its project-local skill lives at `.prime/agent/skills/react-grab/SKILL.md`.

Agentation is also available for persistent visual annotations. `pnpm dev` starts an isolated in-memory Agentation service on `127.0.0.1:4748`, exposes it to the renderer through the same-origin `/__agentation` proxy, and cleans up only the service process it owns. MCP-aware clients discover the connection through `.mcp.json`; Prime Agent can read it through `.prime/agent/skills/agentation-dev`. Check the integration with `pnpm agentation:doctor`.

Both renderer tools are guarded by `import.meta.env.DEV` and excluded from production builds.

Development builds expose a sidebar performance switch for an opt-in diagnostics HUD. FPS, renderer CPU, and renderer working-set memory are process-wide. Sidebar and Main ratings are separate rolling React render measurements: after ten samples, p95 render duration maps from 10/10 at 4 ms or less to 1/10 at 50 ms or more. Turning the HUD off—or entering compact navigation—stops its animation-frame loop and one-second resource sampler and clears the rolling measurements.

The app targets `/Users/thor/work/ernie` by default. Override it without exposing filesystem authority to the renderer:

```sh
ERNIE_PROJECT_PATH=/path/to/project pnpm dev
```

The Electron binary installer can leave an incomplete macOS bundle under newer Node releases. `pnpm dev` first runs the repair/verification procedure adapted from T3Code:

```sh
pnpm ensure:electron
```

## Runtime and window lifecycle

- Each cataloged project root or linked worktree owns at most one Ernie-managed Prime Agent RPC client. Its path is resolved and authorized in the Electron main process; the renderer never supplies a working directory.
- Ernie keeps at most **three resident runtime clients**. At capacity it evicts only the least-recently-used idle client. It never evicts a working, compacting, queued, switching, or in-flight runtime.
- Model and thinking-level preferences are stored per worktree. Prompt drafts are intentionally not persisted.
- `Cmd–B` toggles workspace navigation without placing a redundant open control in the main titlebar. The sidebar follows the native traffic-light row with its close control, one **Ernie Dev** title, and a shared Search field that filters Spaces and Agents. Secondary Spaces expose an Archive action that removes the directory from Ernie, stops its owned runtime, and preserves files and saved sessions; reopening the folder restores it.
- Prime Agent `0.7.1` does not expose live RLM-depth mutation in RPC mode. The launch surface currently requests root-only depth `0`; the main-process registry still applies creation-time `RLM_MAX_DEPTH` safely before setting the model and thinking level and admitting the first prompt.
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
- `src/main/SpaceRuntimeRegistry.ts` — catalog-authorized project/worktree ownership, a three-client idle-LRU resource limit, runtime-tagged events, and atomic depth/model/thinking/first-prompt sequencing.
- `src/main/WorkspaceCatalog.ts` — catalog-authorized Effect service joining Git worktrees with schema-decoded Prime Agent sessions and serializing managed create, settle, restore, and clean-only checkout removal.
- `src/main/SessionTranscriptStream.ts` — read-only daemon protocol-v7 attachment for bounded selected-session snapshots and live message/tool streams.
- `src/main/RendererPerformanceSampler.ts` — trusted, rate-limited projection of renderer CPU and working-set metrics for the opt-in diagnostics HUD.
- `src/main/DevServerCatalog.ts` — serialized, worktree-scoped discovery of allowlisted local development-server listeners.
- `src/main/ErnieWindow.ts` — Effect-owned Electron window and security boundary.
- `src/main/ErnieApp.ts` — scoped application program and schema-decoded IPC handlers.
- `src/main/index.ts` — Layer composition root, following T3Code's Effect-based desktop structure.
- `src/preload/index.ts` — sandbox-compatible CJS preload exposing Space-addressed state, commands, model/start operations, workspace/session streams, local-server actions, and bounded clipboard writes.
- `src/renderer/src/app.tsx` / `focused-workspace.tsx` — flat Spaces with linked-worktree navigation, worktree-local tabs, keyed live runtime state, and development-only React Grab plus Agentation.
- `src/renderer/src/space-launchpad.tsx` — accessible T3-style first-thread form with dedicated model and model-aware thinking-effort dropdown components.
- `src/renderer/src/spaceSessionTabs.ts`, `transcript.ts`, `sessionTranscript.ts`, and `spaceLaunchPreferences.ts` — pure worktree-local navigation, transcript, and bounded preference state.
- `tests/prime-agent-rpc.test.ts` — direct RPC handshake, event ordering, streaming/tool mapping, and fail-closed framing tests.
- `assets/runtime/` — pinned executable Node and Prime Agent package copied outside ASAR.

The development-server launcher performs immediate, best-effort process/CWD revalidation before opening an exact numeric loopback URL. It is not a network isolation boundary; pages remain outside Ernie in the user's default browser.

The renderer is sandboxed with context isolation enabled, Node integration disabled, no webview support, navigation/popups/permissions/downloads denied, schema-decoded IPC, and a restrictive CSP.

## License

Ernie Dev is available under the [MIT License](LICENSE). Portions are adapted from [T3 Code](https://github.com/pingdotgg/t3code); see [NOTICE](NOTICE) for attribution and license terms.
