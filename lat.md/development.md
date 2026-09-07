# Development workflow

Ernie uses Nub to run its TypeScript tools and gives browser and desktop development separate state by default.

## Development roles

`nub run dev` starts the full browser workflow. `dev:server`, `dev:web`, and `dev:desktop` start one role for focused work.

The development gateway prints its runtime and browser addresses. Browser integration reserves its own port and temporary Prime Agent directory.

## Development profiles

Each profile owns a state root, database, runtime descriptor, process owner, and Electron user data.

All development roles connect to an externally owned Prime Agent socket. Ernie never starts or stops that daemon. See [daemon version policy](../docs/architecture.md#prime-agent-version-boundary).

[[scripts/dev/config.ts#readDevConfig]] parses profile configuration. An absolute `ERNIE_PRIME_AGENT_SOCKET` selects an external daemon and disables daemon ownership.

## UI iteration

The agent reproduces one visible problem, edits through browser HMR, and inspects the result using the existing development runtime.

Follow the [agent-native workflow](../docs/workflow.md) for scenario context, correction, and handoff. Read [UI guidance](../docs/ui.md) for design requirements and [architecture guidance](../docs/architecture.md) for ownership decisions.

The [repository UI rules](../AGENTS.md#ui-iteration) control verification scope. The commands below describe available checks, not permission to run builds, automated tests, or smoke checks during UI work.

## Codex cloud

The [cloud setup guide](../scripts/cloud/README.md) records the Linux environment and recording commands.

[Setup](../scripts/cloud/setup.sh) installs Nub, app dependencies, Electron, and browser recording tools; [maintenance](../scripts/cloud/maintenance.sh) refreshes branch dependencies. The setup command can embed these files before they are published.

The cloud host runs as the `ernie` user under Xvfb. Electron's first import can download its binary, so setup and maintenance perform that import while network access is available. Use a shell directory change for tooling installs; the cloud Nub build rejects `install --cwd`.

`ernie-record` saves videos, interaction traces, step screenshots, and timing data against an existing browser gateway. `ernie-frames` extracts recorded frames and a timestamped HTML viewer. These tools support the HMR inspection loop without replacing the Cypress suite.

## Browser and desktop proof

Browser integration proves the production renderer against the real development gateway. Desktop smoke and Electron E2E prove the packaged process boundary.

Use `nub run test:integration:browser` for browser proof. Reserve `nub run test:e2e` and `nub run test:desktop-smoke` for integration milestones.

## Validation

`nub run check` links Zenbu types, typechecks, runs Ultracite and custom guards, validates lat.md, runs integration checks, and builds source.

Ultracite's core and React presets, plus React Doctor, use Oxlint and Oxfmt. The [lint workflow](../docs/workflow.md#lint-and-format-changes) owns commands, formatting conventions, and compatibility exceptions. Zenbu, StyleX, outline, and package-boundary checks retain their existing owners.

Run `nub run test:integration` for daemon boundaries. Run `konsistent validate` when checking structural conventions.

## Live browser control

Use Codex's @Browser against the existing development gateway. Reuse its live tab, inspect accessibility state before actions, and capture the viewport without navigation or reload.

See docs/workflow.md for the workflow; no additional browser CLI is required.

## Release boundary

Zenbu installs compatible source from a dedicated release branch. Packaged Ernie checks for updates, stages dependencies, and requires confirmation before restarting with new source.

The [release guide](../docs/releasing.md) owns mirror isolation, host compatibility, distribution prerequisites, and update decisions.

### Update activation ownership

The restart helper loads its Node-only modules before replacing source. Profile directories stay in place while the transaction moves tracked files and records completed moves for rollback.

[activation-plan.mjs](../src/main/updates/activation-plan.mjs) owns plan parsing and collision checks. [activation.mjs](../src/main/updates/activation.mjs) owns the transaction. [activation-files.mjs](../src/main/updates/activation-files.mjs) owns safe filesystem movement. [restart-process.mjs](../src/main/updates/restart-process.mjs) owns the shutdown deadline.

[[src/main/updates/git-http.ts#createGitHttpClient]] owns request streaming, timeout, and cancellation. Integration fixtures provide local Git HTTP and child-process lifecycles; source packaging excludes the entire integration directory.

### Update performance boundaries

Unchanged releases require metadata only. A validated candidate and successful dependency preparation survive retries. Activation records the final-path Zenbu signature; renderer events replace idle status polling.

The signature adapter is checked against the pinned Zenbu implementation. [[src/main/updates/preparation.ts#PreparedDependencies]] owns preparation invalidation. [[src/renderer/components/use-update-state.ts#useUpdateState]] owns subscription lifetime, initial refresh, and immediate feedback.

## InterfaceKit

InterfaceKit is disabled: the renderer does not import or mount its floating editor toolbar.

## Release channel commands

Development keeps local profiles. Releases use the Ernie identity and ad-hoc signing. Prerelease status changes GitHub metadata only. Official signing remains optional.

See [release commands](../docs/releasing.md). Packaged source and app-history paths derive from the validated package identity. Preparation changes local files; publication requires a clean committed checkout.

## Packaged startup ownership

The recovery parent owns the application lock and uses a separate Chromium profile. Its editable child reuses that ownership and reports renderer readiness over IPC. Reopening the app focuses the child.
