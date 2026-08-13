# Ernie Lynx daemon receiver

This folder contains a minimal ReactLynx receiver with one read-only sidebar.
It has no chat, composer, customization, or annotation components.

The Node host owns Prime Agent. It reads `listWorkspace()` every 500 ms and
projects the daemon's live top-level sessions as `activeAgents`. The native
`WindowedLynxView` passes each changed roster into ReactLynx with `updateData()`.
The Lynx boundary validates every roster before accepting it.

The sidebar shows the current workspace and live top-level Agent names. It keeps
working, queued, needs-input, idle, and settled states from Prime Agent.
The first slice stays intentionally read-only and unvirtualized. Tap an Agent
row to select it. On desktop, focused rows follow native arrow-key traversal.
The open canvas shows the complete selected session object received from the
Prime Agent workspace boundary as formatted JSON. It also shows the raw JSONL
session file. The Node host caches unchanged files between roster updates. A
native desktop scroll view renders metadata and JSONL as two text nodes, keeping
trackpad scrolling responsive without mounting a native node for every line.
Long sessions reveal 200 JSONL lines at a time instead of laying out the entire
file on selection.

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
