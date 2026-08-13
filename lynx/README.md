# Ernie Lynx port

This folder contains Ernie's incremental ReactLynx port. It is a separate
Rspeedy application, not a copy of the Lynx engine source.

The v1 ports the Agent sidebar, conversation surface, task composer, and live
customization controls. Sidebar width and task-input density are user-controlled
jellyware settings. A loopback-only HTTP bridge connects the Lynx bundle to the
existing Prime Agent daemon. Git and the Browser plugin remain outside this bundle.

`src/daemon-contract.ts` ports the harness-neutral descriptor, lifecycle, and
safe failure vocabulary from `t3code/improve-pi-primeagent-daemon`. The next
runtime step is a macOS Native Module adapter that implements this contract.

## Getting Started

Install dependencies with Nub:

```bash
nub install
```

Build and run the native Lynx window with its supervised daemon sidecar:

```bash
nub run dev:lynx
```

For Rspeedy hot reload, start only the bridge from the repository root:

```bash
nub run dev:lynx-daemon
```

Then run `nub run dev` inside `lynx/` and open its bundle in Lynx Explorer.

Run all local checks:

```bash
nub run check
```

The port starts in `src/app.tsx`. The bridge listens only on
`http://127.0.0.1:4319` and exposes workspace, session creation, and task
submission operations.

`nub run dev:lynx` uses the official 13.6 MB `node-lynx@0.1.1` prebuilt runtime.
One host command starts Prime Agent, waits for bridge health, opens the AppKit
Lynx window, and stops the sidecar when the window closes. Prime Agent remains
in Node because Lynx page JavaScript has no process, filesystem, or Git runtime.

The sidebar v1 ports repository rows, live Agent rows, activity ordering,
new-Agent drafts, connection state, and the settings footer. Search, pins,
archives, menus, and Git worktree identity remain deferred bridge operations.

The **Annotate** control is the Lynx-native React Grab equivalent. It outlines
declared component boundaries, shows component and source metadata, and copies
agent-ready context through the loopback bridge. React Grab itself remains in
the Electron renderer because its inspector requires the browser DOM and React
Fiber host nodes that ReactLynx does not expose.
