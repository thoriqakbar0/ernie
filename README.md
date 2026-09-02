# Ernie

Ernie is a Zenbu.js application backed by the real Prime Agent daemon.

## Development

Install dependencies with Nub:

```sh
nub install
```

### Daily browser-first development

```sh
nub run dev
```

This starts one windowless Electron main process because Zenbu 0.6.0 requires Electron to host its service graph. It does not create an Electron renderer window. A stable loopback gateway opens the production Ernie renderer in the normal browser at `http://127.0.0.1:4310`.

The browser uses the real Zenbu RPC, events, database replica, service hot reload, and Prime Agent daemon. Renderer edits use Vite HMR without restarting the service host.

Development state is isolated under `.zenbu/dev/browser/`:

```text
.zenbu/dev/browser/
├── db/
├── electron-user-data/
├── prime-agent/
├── prime-agent.sock
├── owner.json
└── runtime.json
```

Use a separate profile and port for concurrent worktrees or agents:

```sh
ERNIE_DEV_PROFILE=review-42 ERNIE_DEV_PORT=4410 nub run dev
```

To read sessions from an existing local Prime Agent supervisor, provide its absolute socket path explicitly:

```sh
ERNIE_PRIME_AGENT_SOCKET=/absolute/path/to/prime-agent.sock nub run dev
```

Ernie treats an explicit socket as externally owned. It reports an unavailable socket instead of starting or replacing a daemon at that path.

A profile has one owner. A second owner fails instead of deleting or sharing live state. Runtime metadata is local, mode `0600`, ignored by Git, and never prints the Zenbu authentication token.

### Split development modes

```sh
# Real Zenbu and Prime Agent host without opening a browser
nub run dev:server

# Attach the stable browser gateway to an existing dev:server
nub run dev:web

# Real visible Electron application with isolated desktop development state
nub run dev:desktop
```

`dev:web` never starts a mock or silently creates a backend. It fails when the selected profile has no live `dev:server`.

## Verification ladder

Use the cheapest proof that crosses the boundary changed by the work:

```sh
# Fast unit and renderer tests
nub run test

# Type generation, typecheck, tests, boundaries, and staged source build
nub run check

# Real browser, Zenbu RPC, Prime Agent session creation, and Vite HMR
nub run test:integration:browser

# Real Electron renderer startup without Cypress
nub run test:desktop-smoke

# Full isolated Electron user journey; reserve for integration milestones
nub run test:e2e
```

Open Cypress interactively only when debugging a browser or Electron journey:

```sh
nub run test:integration:browser:open
nub run test:e2e:open
```

The browser integration and desktop smoke commands use temporary database, agent, socket, and Electron profile directories, then remove them on exit.

## Reference snapshots

Thin T3 Code and Effect snapshots live under the ignored `repos/` directory. Refresh both pinned snapshots with:

```sh
nub run repos:sync
```

`repos.lock.json` pins each remote commit and sparse path set. The sync uses shallow, filtered checkouts and removes Git metadata from the result. To use an existing local checkout as a faster source, create the ignored `repos.local.json` file:

```json
{
  "sources": {
    "t3code": "/absolute/path/to/t3code"
  }
}
```

The committed lock never contains machine-specific paths, so another machine can reproduce the snapshots from their pinned remotes.

## Production

```sh
nub run build:source
nub run build:electron
```

Electron builds use `thoriqakbar0/ernie` on `main` as the installed source mirror. Initialize or publish that mirror only during an explicitly authorized release.

Development builds load Agentation from `/Users/thor/work/agentation/package`. React Doctor scans the renderer through `nub run doctor`.
