# Deep modules

Add a package only when it owns a domain boundary:

```text
src/packages/<name>/
  index.ts
  client.ts
  lib/
```

Package root files are entry points. Import a package only through these files.

Put implementation in `lib/`. Files in any package subfolder are private.

Integration tests live in `src/integration/` and use public entry points.

Do not create barrel files that re-export a subtree. Add several small root entry points when callers need separate interfaces.

Run `nub run lint:boundaries`. The command rejects deep imports, test imports from production code, and dependency cycles.
