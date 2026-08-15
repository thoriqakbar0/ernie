# 05 — Inspect and verify the sidebar UI capability

**What to build:** Let a caller inspect and control Ernie's sidebar through the established renderer capability bridge. Visibility and width mutations must return the authoritative applied state.

**Blocked by:** 04 — Inspect and verify the theme UI capability.

**Status:** ready-for-agent

- [ ] A caller can inspect sidebar visibility and width through the public CLI.
- [ ] Existing show, hide, and width command paths remain valid and preserve readable success behavior.
- [ ] Show and hide complete only after renderer-owned state applies and persists the requested visibility.
- [ ] Width changes complete only after renderer-owned state applies and persists the requested width.
- [ ] Successful mutations return both authoritative sidebar visibility and width in typed UI control results.
- [ ] Minimum and maximum widths remain accepted; fractional and out-of-range widths remain usage failures.
- [ ] Renderer unavailability, timeout, and failed state verification return stable safe failures.
- [ ] Focused renderer tests prove observable sidebar state and persistence through public boundaries.
- [ ] The black-box CLI-to-socket tests cover inspection, every mutation, boundary values, failures, and exit codes.
- [ ] Type checks, lint, dependency-boundary checks, and tests pass.
