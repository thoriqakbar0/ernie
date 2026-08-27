# Deep modules

Copy `example` when you add a package:

```text
src/packages/<name>/
  index.ts
  client.ts
  lib/
  tests/
```

Package root files are entry points. Import a package only through these files.

Put implementation in `lib/`. Files in any package subfolder are private.

Tests belong in `tests/`. Tests use entry points, including their own package's entry points.

Do not create barrel files that re-export a subtree. Add several small root entry points when callers need separate interfaces.

Run `nub run lint:boundaries`. The command rejects deep imports, test imports from production code, and dependency cycles.
