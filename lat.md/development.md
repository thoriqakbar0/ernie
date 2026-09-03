# Development workflow

Ernie uses Nub to run its TypeScript tools and gives browser and desktop development separate state by default.

## Development roles

`nub run dev` starts the full browser workflow. `dev:server`, `dev:web`, and `dev:desktop` start one role for focused work.

The development gateway prints its runtime and browser addresses. Browser integration reserves its own port and temporary Prime Agent directory.

## Development profiles

Each profile owns a state root, database, runtime descriptor, process owner, agent directory, daemon socket, and Electron user data.

[[scripts/dev/config.ts#readDevConfig]] parses profile configuration. An absolute `ERNIE_PRIME_AGENT_SOCKET` selects an external daemon and disables daemon ownership.

[[tests#Behavior specifications#Development boundary#Profile isolation]] protects separate profile state.

## Browser and desktop proof

Browser integration proves the production renderer against the real development gateway. Desktop smoke and Electron E2E prove the packaged process boundary.

Use `nub run test:integration:browser` for browser proof. Reserve `nub run test:e2e` and `nub run test:desktop-smoke` for integration milestones.

## Validation

`nub run check` links Zenbu types, typechecks, runs unit tests, checks package boundaries, validates lat.md, and builds source.

Run `nub run test:integration` for daemon boundaries. Run `konsistent validate` when checking structural conventions.
