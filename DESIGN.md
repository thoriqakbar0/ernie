# Design

## Current state

The renderer uses a focused-project workspace derived from the selected Variant B prototype. The prototype source remains on branch `prototype/session-mapping-focused-project` at commit `4fa17c0`; the production implementation is intentionally rewritten rather than promoted directly.

A narrow project rail contains every user-opened directory. Selecting a project scopes the adjacent navigator to that directory’s worktrees and sessions instead of showing every session at once. The main column contains global session tabs and the selected session surface.

Official Agentation remains mounted directly in development builds and syncs to the project-local Agentation MCP server through a same-origin Vite proxy. Production builds contain neither the toolbar nor the proxy.

## Workspace hierarchy

- Workspace → Project directory → Worktree → Session → Subagent is the canonical mapping.
- **Open folder** uses the trusted native directory picker. Added projects persist across restarts.
- Only one project is focused in the navigator at a time; switching projects does not close its session tabs.
- Clicking a session opens or focuses one global tab for that session.
- Closing a tab only closes its view. It never stops, deletes, or archives the session.
- A running session has a restrained indeterminate activity bar. No fake completion percentage is shown.
- Session titles integrate their project context in tab copy instead of adding a separate badge.
- Child sessions remain read-only until targeted daemon-backed commands exist.

## Visual rules

- Live work is visually primary; project and Git infrastructure remain quiet.
- Project buttons use compact directory-derived initials and always expose the full path as accessible context.
- The selected project uses a clear filled state; inactive projects recede without disappearing.
- Worktrees are disclosure groups. Sessions carry name, summary or state, and live activity only when relevant.
- Motion is brief and purposeful, and running indicators become static under reduced motion.
- Empty, detached, loading, and refresh-failure states remain explicit.

## Preserved constraints

- Renderer sandboxing, CSP, context isolation, typed IPC, and navigation denial remain product guarantees.
- The renderer cannot choose or persist arbitrary paths itself; native selection and persistence stay in the trusted main process.
- Agentation copy uses a sender-validated, write-only, size-bounded clipboard IPC capability; the renderer cannot read clipboard contents.
- Forced-colors, keyboard, screen-reader, zoom, narrow-window, and minimum-window support remain required.
