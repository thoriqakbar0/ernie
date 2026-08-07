# Design

## Current state

The renderer is intentionally reset to an empty near-black canvas. The previous worktree rail, global tabs, chat timeline, composer, dialogs, and decorative startup surfaces are no longer mounted.

Official Agentation remains mounted directly in development builds so the replacement interface can be reviewed and annotated in place. Production builds keep the canvas empty while the new interface is under construction.

## Replacement direction

The next interface will borrow heavily from T3 Code’s operating model while retaining Ernie’s Prime Agent domain and security boundaries:

- project-first navigation;
- projects grouping their worktrees and sessions;
- one active chat surface rather than competing navigation layers;
- inline draft/new-thread flow instead of a creation modal;
- compact project/thread breadcrumbs;
- right-aligned user messages and unboxed assistant responses;
- collapsed work/tool activity and notebook-like IPython executions;
- a composer integrated with the conversation timeline;
- read-only selected root/subagent sessions presented through the same chat grammar.

This is a UX reference, not permission to copy T3 Code’s unsafe webview architecture, thread semantics, branding, or runtime authority.

## Preserved constraints

- Renderer sandboxing, CSP, context isolation, typed IPC, and navigation denial remain product guarantees.
- Agentation copy uses a sender-validated, write-only, size-bounded clipboard IPC capability; the renderer cannot read clipboard contents.
- Agentation is development-only and is used directly rather than reimplemented.
- Main-process Prime Agent RPC, daemon attachment, workspace catalog, and browser authority remain intact behind the empty renderer.
- Reduced-motion, forced-colors, keyboard, screen-reader, zoom, and minimum-window support must be rebuilt with the replacement interface.
