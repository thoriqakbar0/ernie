# Ernie

Ernie is a local desktop workspace for reading and directing Prime Agent sessions.

## Product

The product behavior and user-facing constraints are defined in `PRODUCT.md`.

## Design

The visual system and interaction rules are defined in `DESIGN.md` and `docs/ui.md`.

## Runtime

The renderer consumes typed Prime Agent snapshots through Zenbu RPC and events. Development profiles use isolated daemons unless `ERNIE_PRIME_AGENT_SOCKET` selects an externally owned socket.

Failed external reconnects keep the last snapshot and retry one connection attempt at a time until recovery or disposal. Ernie cleanup closes its client but leaves the external daemon and socket running.

## Validation

Run `nub run check`, the browser integration suite, Electron E2E, `konsistent validate`, and `lat check` before release.
