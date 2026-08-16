# Positioning statements — Ernie

> ⚠️ IN PROGRESS — messages walked: 2 of 18 (2 settled, 0 retired); currently on: "the first packaged macOS prerelease." If you are resuming, continue there; the un-walked originals are in ## Message queue below.

This draft targets builders studying agent-shaped interfaces. No ideal-customer definition, needs stack, interviews, or VOTERS.md exists, so that audience remains an informed assumption. Ernie is a public experiment artifact with no pricing strategy. Statements are numbered in settle order and frozen; each records its source.

## What you promise (one level up)

**P1.** a fixed workspace for studying what agent-shaped software requires.
    Reworked from: "a macOS workspace for Prime Agent."

**P2.** Ernie is a macOS artifact for testing a specific question: how can an agent influence the interface without controlling the whole application? v0.1.0 tests narrow UI controls and plugin lifecycles inside a fixed shell.
    Reworked from: "Ernie v0.1.0 is a fixed macOS workspace for Prime Agent sessions. It groups sessions by repository and Git worktree, then shows messages, tool calls, queued work, and child Agents. Prime Agent executes the work and stores the sessions. Ernie does not yet build a different interface for each task. The essay describes that experiment."

## What you do (your level — features)

## Against the vendors above

## What you make obsolete

## Commiseration

## Aspirations

## Message queue (originals, not yet walked — removed at finalization)

2. ~~"Ernie v0.1.0 is a fixed macOS workspace for Prime Agent sessions. It groups sessions by repository and Git worktree, then shows messages, tool calls, queued work, and child Agents. Prime Agent executes the work and stores the sessions. Ernie does not yet build a different interface for each task. The essay describes that experiment."~~
3. "the first packaged macOS prerelease."
4. "read release details"
5. "the sidebar groups repositories, worktrees, and Prime Agent sessions."
6. "each session stays with its repository."
7. "Prime Agent owns execution and durable session state. Ernie presents that state and sends typed requests through its daemon adapter."
8. "repository and worktree context — each session stays grouped with the repository or linked Git worktree where it runs."
9. "Prime Agent owns the session — Ernie reads and updates sessions through Prime Agent. It does not store a competing copy of session history."
10. "local controls have limits — the UI CLI can focus the window, select a light or dark theme, and change the sidebar. It cannot control sessions or Git."
11. "v0.1.0 runs on Apple silicon."
12. "v0.1.0 packages the working Electron application, its renderer, and the installed Prime Agent runtime graph for Apple silicon."
13. "the public ZIP uses an ad-hoc signature and is not notarized by Apple. macOS can block the first launch. A standard macOS release would require Developer ID signing and Apple notarization; no date is promised."
14. "download the public prerelease"
15. "one focused session, with model controls beside the composer."
16. "trace a request through Ernie."
17. "the documentation follows a task from the renderer, across Electron IPC, into Ernie’s daemon, and finally to Prime Agent. it also covers the CLI, plugin lifecycle, packaging, and failure recovery."
18. "task-shaped interfaces are still a research direction — v0.1.0 uses a fixed desktop shell. Ernie is a learning lab for whether future, trusted surfaces could preserve the structure an agent discovers without giving it arbitrary control of the interface."

## Retired without a statement

## Facts to verify

## Next steps

Reuse the settled statements across the homepage, documentation, release notes, and repository copy. Build an ideal-customer definition and needs stack before treating this experiment as a commercial product. Ernie has no pricing strategy today.
