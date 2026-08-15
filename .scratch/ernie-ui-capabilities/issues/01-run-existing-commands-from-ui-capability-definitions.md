# 01 — Run existing commands from UI capability definitions

**What to build:** Preserve every current `ernie ui` behavior while moving its command grammar, help, validation, and success rendering behind typed UI capability definitions. A feature developer should have one authoritative definition to change, and a user should observe no regression.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `focus`, both theme values, sidebar show and hide, and every valid sidebar width keep their current public command paths.
- [ ] Existing valid commands retain their readable success behavior and exit with code `0`.
- [ ] Invalid or incomplete command paths receive focused generated usage and exit with code `2`.
- [ ] Application and runtime failures retain safe messages and exit with code `1`.
- [ ] CLI parsing, nested help, input validation, and success rendering derive from typed UI capability definitions rather than parallel command lists.
- [ ] The primary test invokes real CLI arguments through a real temporary owner-only socket and observes output, errors, exit codes, and dispatched commands.
- [ ] Existing socket permission, stale-socket, active-socket, timeout, size, and framing protections remain green.
- [ ] Type checks, lint, dependency-boundary checks, and tests pass.
