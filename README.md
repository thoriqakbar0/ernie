# Ernie

Ernie now starts from a small [Zenbu.js](https://zenbujs.dev/) application.

## Development

Install dependencies and start Electron with Nub:

```sh
nub install
nub run dev
```

Run the isolated Electron browser test:

```sh
nub run test:e2e
```

Open Cypress for interactive browser testing:

```sh
nub run test:e2e:open
```

The launcher starts a real Zenbu Electron process with isolated database, agent, socket, and profile directories.
It discovers the renderer through a private dynamic debugging port and removes its temporary files when Cypress exits.

Run the local checks:

```sh
nub run check
nub run doctor
```

Development builds load Agentation from `/Users/thor/work/agentation/package`.
React Doctor scans the renderer for React correctness and maintainability issues.

Electron builds use `thoriqakbar0/ernie` on `main` as the installed source mirror.
Initialize that mirror only during an explicitly authorized release.
