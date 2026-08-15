# 02 — Discover built-in UI capabilities

**What to build:** Let people and agents discover Ernie's declared UI capabilities and accepted commands from one Capability manifest. The same definitions must power command help, accepted command paths, and machine discovery.

**Blocked by:** 01 — Run existing commands from UI capability definitions.

**Status:** ready-for-agent

- [ ] `ernie ui capabilities` returns a versioned Capability manifest through the public CLI.
- [ ] The manifest declares the `window`, `theme`, and `sidebar` UI capabilities.
- [ ] Every manifest entry includes its stable identifier, summary, command paths, input constraints, result description, and availability.
- [ ] Human root and nested help remain available when the Ernie application is not running.
- [ ] Discovery distinguishes declared built-ins from their current runtime availability.
- [ ] Every advertised built-in command is accepted, and every accepted built-in command appears in help and discovery.
- [ ] Duplicate capability identifiers, duplicate command paths, invalid definitions, and late built-in registration fail deterministically.
- [ ] Ordinary plugin commands never appear in the Capability manifest.
- [ ] The black-box CLI-to-socket tests cover discovery output and safe unavailable-application behavior.
- [ ] Type checks, lint, dependency-boundary checks, and tests pass.
