# Ernie

Ernie now starts from a small [Zenbu.js](https://zenbujs.dev/) application.

## Development

Install dependencies and start Electron with Nub:

```sh
nub install
nub run dev
```

Run the local checks:

```sh
nub run check
nub run doctor
```

Development builds load Agentation from `/Users/thor/work/agentation/package`.
React Doctor scans the renderer for React correctness and maintainability issues.

Electron builds use `thoriqakbar0/ernie` on `main` as the installed source mirror.
Initialize that mirror only during an explicitly authorized release.
