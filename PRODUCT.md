# Product

## Purpose

Ernie Dev is a desktop runtime foundation for Prime Agent across local project directories.

The previous interface was removed for a clean restart. This document now describes only the retained runtime boundary.

## Platform

- Electron 41 with a blank, sandboxed renderer.
- Effect services and Layers own lifecycle, subprocess authority, typed failures, and application composition.
- A pinned Apple-silicon Node and Prime Agent runtime is packaged outside ASAR.
- pnpm is the only supported package manager.

## Capabilities

- Direct Prime Agent JSONL RPC; terminal output is never scraped.
- Strict LF framing, fatal UTF-8 decoding, bounded records/stderr, correlated requests, timeouts, and fail-closed child lifecycle.
- Incremental assistant text, tool and delegation lifecycles, session state, token/context usage, cost, abort, new session, compaction, and preserved Prime Agent model/thinking RPC fidelity.
- Persisted multi-project catalog with catalog-authorized managed worktree creation, recoverable settled state, and clean-only checkout removal.
- Resumable daemon transcript attachment with monotonic event cursors, authoritative snapshot replacement, bounded reconnect backoff, and scope-owned cleanup.
- Sandboxed preload with a narrow, typed command/event contract; renderer receives no process, shell, or filesystem capability.

## Product Constraints

- Minimum window size is 820×520.
- Credentials and provider secrets are never bundled or sent to the renderer.
- The package is currently an ad-hoc-signed local Apple-silicon build.

## Principles

1. Structured Prime Agent events are authoritative.
2. Expected failures use typed values.
3. Security authority remains in Electron main.
4. The next interface must start from current product requirements.
