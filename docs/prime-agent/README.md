# Prime Agent boundary

Ernie presents and controls a subset of Prime Agent through its main-process service. Read these pages before changing daemon lifecycle, transport, or agent controls.

- [Ernie integration](ernie-integration.md): ownership, identity, synchronization, recovery, and supported service operations.
- [Upstream daemon](upstream-daemon.md): supervisor, workers, protocol, and native capabilities.
- [API reference](api/README.md): request fields, client methods, responses, events, and usage examples.
- [Capability map](capabilities.md): what Ernie exposes and what remains upstream-only.

## Evidence baseline

Reviewed against UI branch source at `f2aeba483abe44b6284a2618ed59c8c672ef4773`, its working tree, and installed `prime-agent` 0.9.3 on 2026-09-07. This is a source audit, not proof of a running daemon's identity. Recheck package versions and the daemon hello after upgrades.

The installed protocol declarations report `prime-agent.daemon`, protocol 7. Ernie requires schema revision 26 or newer. The bundled daemon guide still labels its protocol section v4; use installed declarations and Ernie's handshake checks for version decisions.

The [package manifest](../../package.json) pins the runtime. Installed upstream references are `node_modules/prime-agent/docs/daemon.md`, `docs/agent-connection.md`, and `dist/modes/daemon/daemon-protocol.d.ts` beneath that package. These paths require installed dependencies and are not vendored here.
