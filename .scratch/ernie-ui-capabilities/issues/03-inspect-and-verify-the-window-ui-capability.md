# 03 — Inspect and verify the window UI capability

**What to build:** Let a caller inspect Ernie's window and focus it with a UI control result that proves the visible postcondition. This slice establishes the versioned typed result contract across CLI, socket, and main-process state.

**Blocked by:** 02 — Discover built-in UI capabilities.

**Status:** ready-for-agent

- [ ] A caller can inspect the `window` UI capability through the public CLI without mutating it.
- [ ] Window inspection reports availability, visibility, focus, and minimized state from authoritative application state.
- [ ] The existing focus command restores and shows the window before focusing it.
- [ ] A successful focus result proves that the window is visible, focused, and not minimized.
- [ ] Success uses the versioned UI control result envelope with capability, command, and typed state data.
- [ ] An absent application and an unavailable window return distinct stable failures without exposing transport details.
- [ ] Mixed protocol versions return an explicit protocol mismatch.
- [ ] Malformed or unsafe results are rejected at the client boundary.
- [ ] The black-box CLI-to-socket tests cover inspection, verified focus, failures, output, and exit codes.
- [ ] Type checks, lint, dependency-boundary checks, and tests pass.
