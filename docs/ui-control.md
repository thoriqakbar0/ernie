# Use the Ernie CLI

This guide shows how to inspect and control a running Ernie application from a
shell. It assumes you are in the repository root and have installed the project
dependencies.

The CLI controls visible application state only. It cannot read, create, stop,
or modify Prime Agent sessions.

## 1. Start Ernie

Run Ernie in one terminal:

```sh
nub run dev
```

Keep this process running while you use the CLI in another terminal.

## 2. Inspect the command surface

Show every built-in command:

```sh
nub run cli -- --help
```

Narrow help to one command group:

```sh
nub run cli -- ui sidebar --help
```

Help does not connect to Ernie. It writes usage to standard output and exits
with status `0` for a known command path.

Inspect the live, machine-readable capability manifest:

```sh
nub run cli -- ui capabilities
```

The command writes JSON containing `schemaVersion`, each capability identifier,
its current availability, command paths, and input constraints. Use this
manifest when automation must discover supported commands instead of assuming
that every Ernie version has the same UI surface.

## 3. Control the window

Restore, show, and focus the Ernie window:

```sh
nub run cli -- ui focus
```

The command fails when Ernie is not running or has no available window.
On success it prints `Ernie focused.`.

## 4. Change the appearance

Select and save either supported color theme:

```sh
nub run cli -- ui theme dark
nub run cli -- ui theme light
```

Each successful command names the saved theme, such as
`Ernie theme set to dark.`.

## 5. Control the sidebar

Show or hide the repository sidebar:

```sh
nub run cli -- ui sidebar show
nub run cli -- ui sidebar hide
```

Set and save its width from `192` through `384` pixels:

```sh
nub run cli -- ui sidebar width 320
```

Successful visibility and width changes print a short confirmation.

## Use the CLI in shell automation

Within this repository, use `nub run cli --` followed by the documented `ernie`
arguments. The compiled entry point itself uses the `ernie` command name, so
help output appears as commands such as `ernie ui focus`.

The CLI uses these output and exit-status rules:

| Status | Meaning | Output stream |
| --- | --- | --- |
| `0` | Help or command success | Standard output |
| `1` | Runtime, availability, or protocol failure | Standard error |
| `2` | Invalid command or arguments | Standard error |

Successful UI changes print one short confirmation. `ui capabilities` prints
only its JSON manifest to standard output. This keeps both forms safe to consume
from scripts.

## Local security boundary

The CLI connects to
`~/Library/Application Support/Ernie/ui-control.sock` on macOS. Ernie creates
the socket with owner-only permissions and removes the socket it owns during a
clean shutdown.

Requests and responses use a bounded, versioned JSON protocol. Ernie parses
each request before dispatching it and exposes only registered UI capabilities.
The socket is a local control boundary, not a general Electron or Prime Agent
command channel.
