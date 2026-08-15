# 06 — Complete the automation-safe UI control contract

**What to build:** Complete the agent-composable UI control surface. A caller can discover capabilities, inspect all current UI state, perform verified mutations, and recover from stable failures without Ernie prescribing a workflow.

**Blocked by:** 03 — Inspect and verify the window UI capability; 04 — Inspect and verify the theme UI capability; 05 — Inspect and verify the sidebar UI capability.

**Status:** ready-for-agent

- [ ] `ernie ui inspect` returns one versioned snapshot of every available built-in UI capability.
- [ ] Aggregate inspection reports unavailable capabilities explicitly without hiding available capability state.
- [ ] Discovery, inspection, mutation, and failure results support one documented machine-readable rendering.
- [ ] Existing readable success behavior remains compatible for current commands.
- [ ] Standard output contains successful command data, while human diagnostics use standard error.
- [ ] Success exits with code `0`, runtime failure exits with code `1`, and usage failure exits with code `2`.
- [ ] Stable failures cover unavailable applications, unavailable capabilities, invalid requests, invalid responses, protocol mismatch, internal failure, and failed state verification.
- [ ] No raw socket, IPC, filesystem, or stack errors reach callers.
- [ ] Documentation explains discovery, inspection, verified mutation, result envelopes, failure semantics, and the local security boundary.
- [ ] Documentation reserves explicit plugin automation contributions while keeping runtime plugin registration out of scope.
- [ ] An end-to-end test proves an agent can discover, inspect, mutate, verify, and branch on failure using only the public CLI.
- [ ] The full repository check passes, including type checks, lint, dependency boundaries, and tests.
