# Development workflow

Ernie uses Nub to run its TypeScript tools and gives browser and desktop development separate state by default.

## Development roles

`nub run dev` starts the full browser workflow. `dev:server`, `dev:web`, and `dev:desktop` start one role for focused work.

The development gateway prints its runtime and browser addresses. Browser integration reserves its own port and temporary Prime Agent directory.

## Development profiles

Each profile owns a state root, database, runtime descriptor, process owner, agent directory, daemon socket, and Electron user data.

[[scripts/dev/config.ts#readDevConfig]] parses profile configuration. An absolute `ERNIE_PRIME_AGENT_SOCKET` selects an external daemon and disables daemon ownership.

## UI iteration

The agent reproduces one visible problem, edits through browser HMR, and inspects the result using the existing development runtime.

Follow the [agent-native workflow](../docs/workflow.md) for scenario context, correction, and handoff. Read [UI guidance](../docs/ui.md) for design requirements and [architecture guidance](../docs/architecture.md) for ownership decisions.

The [repository UI rules](../AGENTS.md#ui-iteration) control verification scope. The commands below describe available checks, not permission to run builds, automated tests, or smoke checks during UI work.

## Browser and desktop proof

Browser integration proves the production renderer against the real development gateway. Desktop smoke and Electron E2E prove the packaged process boundary.

Use `nub run test:integration:browser` for browser proof. Reserve `nub run test:e2e` and `nub run test:desktop-smoke` for integration milestones.

## Validation

`nub run check` links Zenbu types, typechecks, checks package boundaries, validates lat.md, and builds source.

Run `nub run test:integration` for daemon boundaries. Run `konsistent validate` when checking structural conventions.
