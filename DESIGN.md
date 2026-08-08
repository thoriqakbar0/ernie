# Ernie interface design

Ernie is a quiet desktop workspace for developers who run several Prime Agent sessions across several local directories. Live work should be easy to locate without turning the interface into a process monitor. Product behavior and security constraints live in [PRODUCT.md](./PRODUCT.md); this document owns the interface model, visual language, and interaction rules.

The focused-project layout originated in Variant B of the session-mapping prototype, preserved on branch `prototype/session-mapping-focused-project` at commit `4fa17c0`. Production code is a deliberate rewrite rather than promoted prototype code.

## Design principles

1. **Focus before inventory.** Show one project’s session tree at a time. Other projects remain one selection away instead of competing for attention.
2. **Live work is primary.** Session names, current activity, and required input outrank Git and runtime metadata.
3. **Location stays legible.** Every session has a visible path through project and worktree, but location appears as supporting context rather than repeated badges.
4. **Views are not processes.** Opening or closing a tab changes only the view. Starting, stopping, deleting, and archiving sessions require separate explicit actions.
5. **Motion carries state.** Animate only real ongoing activity or a spatial transition. Never imply measurable progress when Ernie has no percentage.
6. **Native authority stays visible.** Trusted operating-system actions, such as choosing a directory, use native controls rather than simulated web UI.

## Conceptual model

```text
Workspace
└── Project directory
    └── Worktree
        └── Session
            └── Subagent

Open session ──opens or focuses──> Tab
```

- A **workspace** is the complete Ernie window.
- A **project** is a user-opened local directory. Projects persist across launches.
- A **worktree** is a Git checkout within a project. A non-Git project behaves as a single directory-backed worktree.
- A **session** is a Prime Agent session mapped to the directory where it runs.
- A **subagent** is a session with an explicit parent-session relationship.
- A **tab** is an open view of one session. It does not own the session lifecycle.

Use these terms consistently in UI copy, code, and documentation. Do not use “repository,” “folder,” and “project” interchangeably: **Open folder** is the native action; **project** is the object created in Ernie.

## Workspace anatomy

The window has three stable regions.

### Project rail

The narrow leading rail answers, “Which project am I looking at?”

- One compact button per open project, using directory-derived initials.
- Full project name and path remain available through accessible names and tooltips.
- The active project uses a quiet filled selection state.
- **Open folder** stays at the bottom as a distinct dashed control.
- The title-bar area and unused rail surface are safe drag regions. Project controls remain non-draggable.

### Focused project navigator

The middle panel answers, “What is happening in this project?”

- Reserve the native macOS title-bar safe area before project name and path. The project rail and navigator use the same `--titlebar-safe-height` token.
- Project name is primary; its absolute path is secondary and truncates without wrapping.
- Worktrees are disclosure groups with session counts.
- Sessions nest only through authoritative parent relationships. Missing or cyclic relationships fail open as top-level rows instead of hiding work.
- A session row shows its name, summary or status, and a state mark. A running session also receives the indeterminate activity bar.
- Switching projects does not close tabs or stop sessions.

### Session workspace

The main column answers, “What am I working on now?”

- Global session tabs occupy the title-bar row. Tab copy integrates project context: `Session name · Project`.
- Clicking a session opens its tab once; later clicks focus the existing tab.
- Closing the active tab selects the nearest remaining tab. Closing the final tab returns to the empty state.
- The breadcrumb shows project, worktree, and session once. Do not repeat this provenance as a separate badge stack.
- A detached tab explains that its session is unavailable and that closing the view will not delete saved work.
- Until targeted daemon-backed commands exist, non-root session surfaces remain read-only.

## Session states

| State | Meaning | Treatment |
| --- | --- | --- |
| Working | Prime Agent is actively running | Green state mark and indeterminate activity bar |
| Waiting | The session needs input | Amber state mark; no motion |
| Idle | Available but not running | Neutral state mark |
| Completed | Work finished or session archived | Muted green state mark |
| Failed | Runtime or diagnostic failure | Red state mark and recoverable copy |
| Cancelled | Work was intentionally interrupted | Muted neutral state mark |
| Disconnected | The session or worktree is no longer attached | Muted state and explicit detached explanation |

The activity bar communicates liveness, not completion. Under reduced motion it becomes a static full-width line. Never add a percentage unless Prime Agent supplies authoritative progress.

## Visual language

### Color

Ernie uses near-black layered surfaces with low-contrast separators. Color is reserved for selection, status, and recovery.

- `--canvas`: primary work surface.
- `--rail`: deepest navigation surface.
- `--panel`: focused navigation surface.
- `--raised`: tabs and compact state surfaces.
- `--accent`: focus and selected-project emphasis.
- `--success`, `--warning`, and `--danger`: semantic states only.

Do not use gradients for text, decorative glows, or color as the only state signal. Preserve contrast in default and forced-color modes.

### Typography

Use the native system stack. Interface text is compact but not monospaced; reserve monospace for code, paths, and measurements when those distinctions matter.

- Project and session names use sentence case.
- Keep hierarchy to clear weight and size steps rather than decorative labels.
- Truncate volatile names and paths in navigation; preserve their full value in accessible context.
- Main-surface copy stays within a readable 65–75 character measure.

### Shape and depth

- Navigation rows use 7–9px radii; compact controls use 12px where a stronger silhouette is helpful.
- Use surface contrast or a separator, not both a border and shadow on the same element.
- Avoid nested cards. A session overview may use one quiet raised state surface for current activity.
- Icons use one authored outline system with consistent stroke weight and optical size.

### Spacing

- Align text and controls to shared leading edges.
- Keep worktree-to-session indentation consistent and use logical properties for directionality.
- Separate groups with at least twice their internal gap.
- Respect the title-bar safe area and minimum 820×520 window without clipping critical actions.

## Motion

- Disclosure and selection transitions use brief exponential ease-out timing.
- The activity bar is the only continuous animation.
- Do not animate idle decoration.
- `prefers-reduced-motion` removes spatial transitions and converts running activity to a static signal.

## Interaction and accessibility

- Every control uses a semantic button with a specific accessible name.
- Keyboard focus must remain visible against every surface.
- Tabs follow expected tablist semantics; session selection and tab closing are separate controls.
- Project and worktree navigation remains usable at 200% zoom and the minimum window size.
- Forced-color mode must retain selection, focus, hierarchy, and status meaning.
- Errors name the problem and recovery. Empty states explain what the place is and provide one next action.
- Directory selection and persistence remain in the trusted Electron main process; the renderer receives only typed, renderer-safe projections.

## Copy vocabulary

| Use | Avoid |
| --- | --- |
| Open folder | Add repo, Import workspace |
| Project | Folder, Repo, Workspace project |
| Worktree | Branch folder |
| Session | Chat, Run, Thread when referring to the session object |
| Subagent | Child bot, Worker |
| Close tab | Stop session |
| Waiting for input | Paused, Stuck |

Use **thread** only for the explicit “new thread” product action, not as a synonym for an existing session.

## Non-goals

- A dashboard that shows every project and every session simultaneously.
- Process-manager density, CPU graphs, or terminal-like chrome.
- Fake progress percentages.
- Closing a view as an implicit destructive action.
- Renderer access to arbitrary filesystem or shell capabilities.
- A second visual system for development-only tools.

## Review checklist

Before merging interface changes, verify:

- The focused project remains obvious within seconds.
- Project switching preserves open tabs and running sessions.
- Session location is visible without duplicated metadata.
- Working, waiting, failed, empty, and detached states are distinguishable.
- Closing a tab cannot stop or delete work.
- Native title-bar safe regions remain draggable without capturing controls.
- Keyboard, reduced-motion, forced-color, zoom, narrow-window, and long-content cases still work.
- Main-process authority and typed IPC boundaries remain intact.
