# Product

## Purpose

Ernie Dev is a focused desktop workspace for developers running Prime Agent across local project directories. It exposes Prime Agent's authoritative RPC session as a quiet conversation UI rather than wrapping a terminal.

A successful session lets a developer send or steer work, watch assistant text, tools, and delegation activity arrive live, stop a turn, start a clean thread, inspect usage, and observe related agents across repository worktrees.

## Platform

- Electron 41 with a sandboxed React renderer.
- Effect services and Layers own lifecycle, subprocess authority, typed failures, and application composition.
- A pinned Apple-silicon Node and Prime Agent runtime is packaged outside ASAR.
- pnpm is the only supported package manager.

## Capabilities

- Direct Prime Agent JSONL RPC; terminal output is never scraped.
- Strict LF framing, fatal UTF-8 decoding, bounded records/stderr, correlated requests, timeouts, and fail-closed child lifecycle.
- Incremental assistant text, tool and delegation lifecycles, session state, token/context usage, cost, abort, new session, compaction, and preserved Prime Agent model/thinking RPC fidelity.
- Persisted multi-project directory catalog, read-only worktree/session mapping, root/subagent hierarchy, Space-local session tabs, and observable child-agent summaries.
- Resumable daemon transcript attachment with monotonic event cursors, authoritative snapshot replacement, bounded reconnect backoff, and scope-owned cleanup.
- Sandboxed preload with a narrow, typed command/event contract; renderer receives no process, shell, or filesystem capability.

## Product Constraints

- Minimum window size is 820×520.
- Credentials and provider secrets are never bundled or sent to the renderer.
- Child tabs are intentionally read-only until daemon-backed per-session attachment provides a real targeted command surface.
- The package is currently an ad-hoc-signed local Apple-silicon build.

## Principles

1. Live work is primary; infrastructure remains quiet.
2. Structured Prime Agent events are authoritative.
3. Expected failures are typed values and visible, recoverable states.
4. Developer-only inspection tools stay out of packaged builds and product claims.
5. Security authority remains in Electron main; the renderer only expresses domain commands.
6. UI identity is restrained: one “Ernie Dev” title, no redundant logo or DEV badge.
