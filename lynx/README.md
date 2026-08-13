# Ernie Lynx daemon receiver

This folder contains a minimal ReactLynx receiver with one read-only sidebar.
It has no chat, composer, customization, or annotation components.

The Node host owns Prime Agent. It reads `listWorkspace()` every 500 ms and
projects the daemon's live top-level sessions as `activeAgents`. The native
`WindowedLynxView` passes each changed roster into ReactLynx with `updateData()`.
The Lynx boundary validates every roster before accepting it.

The sidebar shows the current workspace and live top-level Agent names. It keeps
working, queued, needs-input, idle, and settled states from Prime Agent.
The first slice stays intentionally read-only and unvirtualized.

Run the native receiver from the repository root:

```bash
nub run dev:lynx
```

Run Lynx checks:

```bash
nub --cwd lynx run check
```

Prime Agent remains in Node because Lynx page JavaScript has no process,
filesystem, Git, or daemon socket runtime.
