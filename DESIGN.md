# Ernie interface design

Ernie is a quiet desktop workspace for developers who run several Prime Agent sessions across several local directories. Live work should be easy to locate without turning the interface into a process monitor. Product behavior and security constraints live in [PRODUCT.md](./PRODUCT.md); this document owns the interface model, visual language, and interaction rules.

The focused-project model originated in Variant B of the session-mapping prototype, preserved on branch `prototype/session-mapping-focused-project` at commit `4fa17c0`. The production interface now adopts Herdr’s high-level information architecture as an Ernie-native workspace: Spaces and Agents as peer sidebar modes, Priority nested within Agents, and session tabs across the main work surface.

## Design principles

1. **Orientation before detail.** Keep Spaces compact, make every active agent globally reachable, and reserve the main surface for one conversation.
2. **Live work is primary.** Agent names, current activity, required input, and failure outrank Git and runtime metadata.
3. **Location stays legible.** Every agent has a visible path through space and worktree, but location appears as supporting context within the row.
4. **Views are not processes.** Opening or closing a tab changes only the view. Starting, stopping, deleting, and archiving sessions require separate explicit actions.
5. **Motion carries state.** Animate only real ongoing activity or a spatial transition. Never imply measurable progress when Ernie has no percentage.
6. **Native authority stays visible.** Trusted operating-system actions, such as choosing a directory, use native controls rather than simulated web UI.

## Conceptual model

```text
Workspace
├── Space
│   └── Worktree
│       └── Agent
│           ├── Session
│           └── Subagent
└── Priority queue ──projects attention from──> Agent status

Open agent session ──opens or focuses──> Tab
```

- A **workspace** is the complete Ernie window.
- A **space** is a user-opened local project directory. Spaces persist across launches.
- A **worktree** is a Git checkout within a space. A non-Git space behaves as a single directory-backed worktree.
- An **agent** is a root Prime Agent or subagent operating in one worktree and represented by its session.
- A **session** is the persisted conversation and activity history belonging to an agent.
- A **subagent** is an agent with an explicit parent-agent relationship.
- **Priority** is a computed view, not a stored attribute or object. It orders agents by attention: Failed, Waiting, Working, then Idle.
- A **tab** is an open view of one agent session. It does not own the agent or session lifecycle.

Use these terms consistently in UI copy. **Open folder** is the trusted native action that creates a **space** in Ernie.

## Workspace anatomy

The window has two stable regions: the unified sidebar and the tabbed session workspace.

### Unified workspace sidebar

The leading sidebar follows the Herdr structure without borrowing its terminal visual styling. Its top-level tabs switch between **Spaces** and **Agents**, giving either inventory the full sidebar height without changing the current session tab. The two choices share one quiet selection surface and an authored outline icon family; **Agents** is the default mode so active work remains immediately visible.

#### Spaces

The Spaces mode answers, “Where can agents work?”

- Show every user-opened space as one compact disclosure row.
- The selected space uses a quiet filled state; a semantic status mark indicates whether it contains live work.
- Expanding a space reveals its worktrees, but not its agents.
- **Open folder** is a persistent, two-line footer action that pairs the command with its purpose, **Add a local space**. When there are no spaces, the same action moves into the empty-state card instead of appearing twice.
- Reserve the macOS title-bar safe area above the Ernie title. The title surface is draggable; every control remains non-draggable.

#### Agents and Priority

The Agents mode contains a nested, quieter two-view segmented control. Its lower visual weight makes **All agents** and **Priority** read as filters within Agents rather than another peer navigation level. Priority remains subordinate because it is a computed projection of agents, not a peer workspace object.

- **Agents** is the default global inventory across every space. Preserve authoritative root/subagent nesting and integrate `Space · Worktree` into each row’s supporting copy.
- **Priority** is a global attention queue ordered Failed → Waiting → Working → Idle. Completed, Cancelled, and Disconnected agents do not enter the queue.
- Selecting an agent focuses its space, opens its session tab once, and makes that tab active.
- A row shows the agent name, explicit textual status, location or priority reason, a redundant semantic state mark, and an indeterminate activity bar only while working. Root/subagent relationships use nested list semantics rather than indentation alone.
- Missing or cyclic parent relationships fail open as top-level agents instead of hiding work.
- A newly commandable RPC conversation may appear before it has a persisted catalog record; render it as **New conversation** and reconcile it when identity becomes available.
- At narrow effective widths—including zoomed desktop windows—the sidebar becomes a modal off-canvas drawer. It traps focus while open, keeps the session inert, and closes from its internal close control, Escape, the pointer scrim, or agent selection before restoring focus to the title-bar navigation control.

### Session workspace

The main column answers, “What am I working on now?”

- Global session tabs occupy the title-bar row. Tab copy integrates status and space context: `Session name · Space · Status`. Tab sets use one roving tab stop, wrapping arrow/Home/End navigation, Delete or Backspace to close the focused tab, a pointer close affordance, and deterministic focus restoration after close.
- Clicking a session opens its tab once; later clicks focus the existing tab.
- Closing the active tab selects the nearest remaining tab. Closing the final tab returns focus to the session workspace empty state.
- The transcript heading integrates space, worktree, and authority (`Interactive` or `Read only`) as one supporting line. Do not repeat this provenance as a separate badge stack.
- A detached tab explains that its session is unavailable and that closing the view will not delete saved work.
- Until targeted daemon-backed commands exist, non-root session surfaces remain read-only.
- A transient daemon disconnect keeps the transcript visible, marks and politely announces **Reconnecting**, disables the composer, and resumes from an authoritative snapshot. Only an exhausted reconnect or daemon `session_closed` event becomes a terminal connection loss.
- A root-runtime failure never leaves contradictory interactive copy. Show one **Unavailable** state, a persistent selectable recovery explanation outside the composer, and a short disabled placeholder.
- The visible transcript remains virtualized, while assistive technology can open a paged, nonvirtual semantic history through a focus-revealed control.

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
- `--rail`: reserved deepest navigation surface.
- `--panel`: unified workspace sidebar.
- `--raised`: tabs and compact state surfaces.
- `--accent`: focus, selected-space emphasis, and the active Agents/Priority view.
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

- Disclosure and selection transitions use brief exponential ease-out timing. The Spaces/Agents selection surface shifts spatially, while the incoming panel uses one restrained fade-and-lift.
- The activity bar is the only continuous animation.
- Do not animate idle decoration.
- `prefers-reduced-motion` removes spatial transitions and converts running activity to a static signal.

## Interaction and accessibility

- Every control uses a semantic button with a specific accessible name.
- Keyboard focus must remain visible against every surface.
- Tabs follow expected tablist semantics. Only tabs enter the composite’s accessibility tree; Delete or Backspace closes the focused tab while a separate pointer affordance remains visible.
- Project and worktree navigation remains usable at 200% zoom and the minimum window size.
- Forced-color mode must retain selection, focus, hierarchy, and status meaning.
- Errors name the problem and recovery. Empty states explain what the place is and provide one next action.
- Directory selection and persistence remain in the trusted Electron main process; the renderer receives only typed, renderer-safe projections.

## Copy vocabulary

| Use | Avoid |
| --- | --- |
| Open folder | Add repo, Import workspace |
| Space | Folder, Repo, Project in user-facing copy |
| Worktree | Branch folder |
| Agent | Bot, Worker |
| Session | Chat, Run, Thread when referring to the persisted conversation |
| Subagent | Child bot |
| Priority | Score, Rank |
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

- Spaces, Agents, Priority, and session tabs are findable within seconds.
- Space switching preserves open tabs and running agents.
- Agent location is visible without duplicated metadata.
- Priority order follows Failed → Waiting → Working → Idle without manual or invented scores.
- Working, waiting, failed, empty, and detached states are distinguishable.
- Closing a tab cannot stop or delete work.
- Native title-bar safe regions remain draggable without capturing controls.
- Keyboard, reduced-motion, forced-color, zoom, narrow-window, and long-content cases still work.
- Main-process authority and typed IPC boundaries remain intact.
