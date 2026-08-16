# Ernie roadmap

Ernie is an experimental learning lab. This roadmap records direction, not a
release date or compatibility promise.

## Port the plugin runtime to Cordis

Ernie v0.1.0 uses its own API v3 plugin host. The host validates manifests,
orders providers before consumers, restores demanded consumers, and owns effect
cleanup. It does not import Cordis or implement Cordis contexts and fibers.

The planned port will evaluate Cordis as the runtime for plugin context, service
injection, plugin fibers, and effect ownership. Ernie will retain its
application-specific manifests, settings, views, Electron adapters, and render
recovery boundaries.

As of Aug 16, 2026, the upstream `cordis` package is `4.0.0-rc.8`. Its repository
states that the API remains unstable. The first Ernie spike must pin one exact
version and commit. It must not follow a moving release range.

## Migration phases

| status | phase | exit gate |
| --- | --- | --- |
| current | freeze the contract | Keep tests for graph validation, demand, provider loss, restart, rollback, cleanup order, and cleanup failure. |
| planned | run a pinned spike | Start Cordis behind an Ernie-owned adapter. Prove context creation, service injection, fibers, and effects without changing UI behavior. |
| planned | port one vertical slice | Move a headless provider-consumer fixture, then the Browser plugin. Preserve native view cleanup and renderer-loss recovery. |
| planned | move built-in plugins | Port Browser, React Grab, and Agentation one at a time. Keep the old path only while parity tests compare both runtimes. |
| planned | remove the custom runtime | Delete the duplicate service graph and reconciler only after every built-in plugin passes the same boundary tests. |

## Required evidence

- Every current plugin-host test passes against the Cordis-backed adapter.
- Provider loss removes dependent behavior before provider cleanup starts.
- Cleanup runs once, in reverse ownership order, after failure and cancellation.
- Renderer and window loss release every Electron resource.
- Disabled plugins stay disabled across restart and provider recovery.
- Startup time and packaged size remain measured and acceptable.
- The dependency stays pinned until Cordis publishes a stable API Ernie has
  verified.

## Not included in this port

- Cordis does not make third-party plugin code safe.
- This port does not add a plugin marketplace or remote plugin installation.
- This port does not compose task-specific interfaces.
- This port does not change Prime Agent's model runtime or session ownership.
- No release number or delivery date is assigned to the port.

The first implementation decision follows the pinned spike. If Cordis cannot
preserve Ernie's observable behavior, the custom host remains in place while the
gap is documented.

## Sources

- [Cordis repository](https://github.com/cordiverse/cordis)
- [Ernie plugin architecture](plugins.md)
