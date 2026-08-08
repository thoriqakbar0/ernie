# Design

## Current state

The renderer is intentionally a sidebar-only shell on an empty near-black canvas. Content, composer, transcript, tabs, dialogs, and startup decoration are not mounted while navigation is rebuilt independently.

The sidebar groups the local project’s worktrees and sessions. It has one active interaction: close the full sidebar. Closing removes it completely and reveals a small, fixed open-sidebar control in the same top-left region. Reopening restores the sidebar without changing workspace or agent state.

Official Agentation remains mounted directly in development builds and syncs to the project-local Agentation MCP server through a same-origin Vite proxy. Production builds show the same sidebar-only shell without Agentation or the proxy.

## Sidebar rules

- Project → Worktrees → Sessions is the sole hierarchy.
- Session rows are informational until a real content destination is rebuilt; they must not look clickable.
- No standalone runtime status, model label, `Ready` indicator, redundant brand badge, or footer chrome.
- Close and open are explicit icon buttons with accessible names and visible focus.
- Sidebar movement is brief, directional, and removed under reduced-motion preference.
- The closed state is fully hidden rather than collapsed into a rail.

## Preserved constraints

- Renderer sandboxing, CSP, context isolation, typed IPC, and navigation denial remain product guarantees.
- Agentation copy uses a sender-validated, write-only, size-bounded clipboard IPC capability; the renderer cannot read clipboard contents.
- Main-process Prime Agent RPC, daemon attachment, workspace catalog, and browser authority remain intact behind the renderer.
- Forced-colors, keyboard, screen-reader, zoom, narrow-window, and minimum-window support remain required.
