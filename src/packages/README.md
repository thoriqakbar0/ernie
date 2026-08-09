# Deep modules

Each immediate folder under `src/packages/` is a flat, deep module. Copy `example/` when you add one.

```text
src/packages/<name>/
├── index.ts       # public entry point
├── client.ts      # optional additional entry point
├── lib/           # private implementation
└── tests/         # private tests and fixtures
```

## Entry-point boundary

Import a package only through its entry points, which are the files at the package root. Never import another package's subfolder.

## Intra-package freedom

A package's implementation files can import other files inside the same package. Keep implementation in `lib/` by convention.

## Tests through entry points

Tests must exercise every package through its root entry points. Tests can import fixtures from their own `tests/` folder, but cannot import implementation internals.

## No cycles

Package dependencies must not form cycles. Run `npm run lint:boundaries` to check every deep-module rule.

Do not create a barrel that re-exports a whole subtree. Add several small root entry points when callers need separate interfaces.
