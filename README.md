# Ernie

Ernie is a macOS desktop client and learning lab for Prime Agent. Prime Agent
owns durable sessions and execution. Ernie gives that work a repository-aware
desktop home.

The project stays intentionally small. Its purpose is to make agent-runtime
boundaries visible enough to build, observe, and explain.

## What Ernie does

- Keeps Prime Agent sessions attached to their repositories and Git worktrees.
- Shows durable conversations, tool activity, queued work, and child Agents.
- Preserves Prime Agent as the source of truth across window and client changes.
- Hosts trusted built-in plugins, including the Browser plugin.
- Tells each Prime Agent session that Ernie is its desktop host.
- Lets people and hosted Agents use typed, local UI controls.

Ernie does not implement its own model runtime. It connects its Electron main
process to Prime Agent through a provider-owned daemon adapter.

```text
renderer -> Electron IPC -> Ernie daemon -> Prime Agent adapter -> daemon socket
```

## Run Ernie locally

Development currently targets macOS and uses Nub `0.7.5` as its package runner.

This checkout also uses a local Agentation dependency. Before installing,
make sure its `file:` path in `package.json` points to your Agentation package.

```sh
nub install
nub run dev
```

The development command builds the Electron main process and renderer, starts
Vite on loopback port `5173`, and opens the development application. Stop the
command with `Control+C`.

Run the complete local verification suite before committing a change:

```sh
nub run check
```

Build the Electron main process and renderer without starting Ernie:

```sh
nub run build
```

## Use the CLI

The repository command builds the CLI before each invocation:

```sh
nub run cli -- --help
nub run cli -- ui capabilities
nub run cli -- ui focus
```

Ernie must be running for capability discovery and UI-changing commands. Help
works without a running application.

See [Use the Ernie CLI](docs/ui-control.md) for every command, exit codes, and
shell-automation behavior.

## Read the documentation

- [Ernie design](docs/design.md) explains the product and interaction model.
- [Own the harness](docs/own-the-harness.md) explains the runtime boundary.
- [Ernie plugins](docs/plugins.md) documents the built-in plugin contract.
- [Use the Ernie CLI](docs/ui-control.md) shows how to inspect and control the app.
- [Lynx experiment](lynx/README.md) covers the separate native-renderer study.

The longer [Ernie development essay](docs/ernie-development.md) records why the
project returned to a smaller learning-lab scope.

## Project status

Ernie is an experimental learning environment, not a packaged public release.
Compatibility can change while its harness and UI boundaries are still being
studied.
