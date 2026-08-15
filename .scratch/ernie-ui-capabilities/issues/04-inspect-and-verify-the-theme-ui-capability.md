# 04 — Inspect and verify the theme UI capability

**What to build:** Let a caller inspect and change Ernie's theme through the same UI capability contract. A theme mutation succeeds only after the renderer-owned state applies and persists the requested value.

**Blocked by:** 03 — Inspect and verify the window UI capability.

**Status:** ready-for-agent

- [ ] A caller can inspect the active `theme` UI capability through the public CLI.
- [ ] Existing dark and light theme command paths remain valid and preserve readable success behavior.
- [ ] Theme mutation uses a fixed request-response bridge to the renderer instead of fire-and-forget dispatch.
- [ ] A successful mutation returns the applied and persisted theme in a typed UI control result.
- [ ] Unsupported theme values remain usage failures and never reach the renderer handler.
- [ ] Missing, disposed, timed-out, or failed renderer ownership returns stable safe failures.
- [ ] The bridge uses declared Electron channels and does not add arbitrary dynamic preload channels.
- [ ] Focused renderer tests prove observable application and persistence without coupling to component internals.
- [ ] The black-box CLI-to-socket tests cover inspection, both mutations, verification, failures, and exit codes.
- [ ] Type checks, lint, dependency-boundary checks, and tests pass.
