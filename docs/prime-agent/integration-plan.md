# Prime Agent integration plan

Tighten native API integration while preserving Ernie’s receipt ledger and daemon ownership. The source audit supports a bounded shutdown fix. Catalog subscriptions, native replay, and renderer lifetime changes remain separate decisions.

## Audit baseline

Audited on 2026-09-07 in `/Users/thor/.codex/worktrees/d410/ernie`, branch `thor/ernie-api-lifecycle`, based on `605f534c11d90b090f25c1d7b424daf53ede5912`. Copied UI edits remain outside this change. A frozen-lockfile Nub install supplied Prime Agent 0.9.3 without changing dependency declarations or the lockfile.

Installed source references below are relative to `node_modules/prime-agent/dist/`. Package availability does not prove the identity or capabilities of an existing user daemon. Runtime checks use isolated fixtures; no user daemon or workbench is required.

## Lifecycle ownership and findings

Each boundary has a different lifetime and identity. Preserve those distinctions when replacing recovery code.

| Boundary | Current owner and evidence | Finding |
| --- | --- | --- |
| Shared socket | `PrimeAgentService.getClient`, `installClient`, `detachClient` in `src/main/prime-agent/service.ts` | One close listener triggers service recovery. Logical connections share this client. |
| Native attachment | `createAttachmentOnce`, `releaseAttachment` | Ernie constructs `DaemonAgentConnection` with the active ID and `closeClientOnDispose: false`. It subscribes before attach and releases the listener on failed acquisition. |
| Attachment admission | `getAttachment` | A promise is reserved before asynchronous acquisition. Concurrent callers share it. Previously, disposal cleared the reservation map without joining those promises. |
| Refresh | `refreshAttachment`, `src/main/prime-agent/refresh.ts` | Snapshot refresh checks attachment identity, connection, generation, and disposal after reading. |
| Recovery | `recoverAttachments`, `src/main/prime-agent/recovery-retry.ts` | Ernie releases old attachments, replaces the client, and resumes by saved native identity. Retry delay is cancellable; native request replay is not enabled. |
| Renderer events | `src/packages/prime-agent/zenbu.ts`, `src/renderer/prime-agent-state.tsx` | Three Zenbu subscriptions belong to the adapter. Runtime disposal waits for attachment promises before unsubscribing. A stalled acquisition can delay listener teardown. |
| Renderer synchronization | `src/packages/prime-workspace/index.ts` | Subscribe-before-snapshot buffers ordered events. An in-flight `synchronize` lacks a post-await disposal check and can continue recovery requests after disposal. |
| Upstream update recovery | `modes/agent-connection/daemon-agent-connection.js:152-192` | An update close can start native reconnect even without `recoverDaemon`. Ernie also observes the raw client close. Replacing this overlap requires a dedicated update-recovery test. |

The renderer findings are source-level risks, not reproduced UI failures. Address them in a separate lifetime change with mount/unmount and pending-request coverage. Do not mix that work into the copied appearance edits.

## Implemented shutdown boundary

Shutdown now closes the shared client before joining attachment cleanup. Closing the socket rejects pending native requests and releases their server-side subscriptions; it does not issue a daemon shutdown command.

The service captures and joins pending attachment acquisitions, initial connection acquisition, and recovery. Acquisition rejects after disposal, including after awaited client and snapshot reads. A completed attachment that loses the final disposal race is released instead of installed. Managed startup checks disposal before spawning or retrying.

Removed behavior: clearing pending attachment reservations without waiting for their cleanup. The existing service remains the owner; no additional lifecycle abstraction or dependency was introduced.

The regression fixture uses the real Zenbu `ServiceRuntime`, Ernie service, and Prime Agent client against a controlled socket. It holds an attach acknowledgement, shuts down the runtime, then checks settled acquisition, rejected later calls, no new socket, and an available external endpoint. The original service fails the settled-acquisition assertion; the changed service passes.

Limits: this does not make arbitrary RPC commands cancellable or guarantee immediate shutdown. A handshake already in progress uses its existing timeout. Upstream update reconnect and concurrent service recovery still need dedicated fault-injection coverage. Existing native attachment isolation checks complement the controlled socket fixture.

Rollback: revert the shutdown guards and cleanup ordering in `service.ts` together with the disposal integration fixture and its behavior specification. Receipt identities, persisted data, and protocol versions do not change.

## Catalog subscription decision

Retain the one-second catalog poll until native roster coverage matches Ernie’s active and saved-session catalog.

Installed evidence:

- `modes/daemon/daemon-supervisor.js:1563-1569`: `roster_subscribe` and `roster_unsubscribe` toggle one boolean per client socket. Independent subscription owners on the same socket can disable each other.
- `modes/agents-view/roster-store.js:18-70`: the store subscribes to messages before requesting its snapshot, buffers racing updates, then applies them after the snapshot. It serializes attachment and passes `recoverable: false`.
- `modes/daemon/daemon-supervisor.js:2201` (`handleList`): `list(all: true)` merges runtime rows with a saved-session catalog scan.
- `modes/daemon/daemon-supervisor.js:3665` (`rosterEntriesForClient`): roster subscription reads the runtime roster. `seedRosterLedger` adds retained descendants associated with worker roots, not every saved root file.
- `modes/daemon/daemon-protocol.js:208-209`: roster commands require negotiated `agent_roster` support.

A future catalog implementation needs one service-owned subscription per socket and a separate saved-session reconciliation policy. Measure create, rename, removal, worker replacement, offline saved-root changes, reconnect, and backpressure resync before removing polling. Specify the saved-file refresh interval and unavailable-capability fallback first. This audit does not establish a replacement timer interval or measured subscription performance.

## Recovery and receipt decisions

Keep the renderer-to-service receipt ledger. Native command identity and Ernie send identity cover different boundaries.

`modes/daemon/daemon-client.js:178-183` enables parking only on request. `requestWire` creates a client-local protocol identity and retains serialized envelopes for replay. `close()` rejects pending requests. Ernie creates replacement clients, so native client identity does not survive its recovery path.

`modes/daemon/command-recovery-journal.d.ts:14-18` states that a missing result after a crash is uncertain and never replayed. A durable receipt of a command is not proof of completed execution. Enabling native recovery also requires a reconnect owner: parked requests can wait indefinitely if their caller is the code responsible for reconnecting. Upstream explicitly requires `recoverable: false` for caller-owned bounded retry loops.

| Failure | Owner and surviving identity | Safe behavior and visible result |
| --- | --- | --- |
| Disconnect before send dispatch | Service attachment admission; Ernie epoch and command ID | Preparation fails as `not-sent`; an explicit fresh retry can dispatch. |
| Lost renderer RPC response | `SendReceipts`; same epoch and immutable command ID | `checkSend` reads the existing outcome without dispatch. An absent receipt reserves `not-sent`, including for a delayed original request. |
| Lost native acknowledgement | Native execution may already exist; service receipt remains | Report `unknown`. Do not automatically resend or infer admission from matching transcript text. |
| Supervisor replacement | Service recovery; saved session ID/file survive, native client ID changes | Reattach native state. Keep send uncertainty; reopening a session does not prove a prior prompt’s admission. |
| Main-service restart | Saved roots survive; receipt map does not; epoch changes | Old sends remain `unknown` rather than dispatching under a new owner. |
| Cancellation | `abort` through the ready native attachment | Cancellation is a separate command. It does not retroactively prove a send was absent or completed. |
| Disposal | Service cleanup; existing receipt entries remain in the retiring instance | Reject new acquisition, close transport, join pending attachment work. Never replay interrupted mutations as part of cleanup. |

Native replay remains a separate proposal. Before enabling it, decide whether Ernie retains a client through reconnect, how update recovery is owned, and how journal uncertainty maps to receipts. Keep the 10,000-entry non-evicting ledger and explicit resend decision intact.

## Capability-driven controls

Use negotiated capabilities for new controls and preserve the existing compatibility gate. No new controls are part of this change.

| Connected state | Required boundary behavior |
| --- | --- |
| Compatible server with a required capability | Permit the corresponding native command through the existing service contract. |
| Compatible server without that capability | Mark that operation unavailable; package declarations alone do not enable it. |
| Incompatible protocol/schema or managed package version | Close Ernie’s client and report incompatibility; leave the daemon running. |
| Temporarily disconnected | Keep the accepted snapshot and disable native commands until attachment recovery succeeds. |

For each future control, record its native command, schema requirement, negotiated capability, service projection, and visible unavailable state. Keep protocol metadata at the service boundary.

## Verification and next decisions

The bounded change requires TypeScript checking, the disposal regression, handshake contracts, send-receipt recovery, native logical attachment isolation, and `lat check`. Keep full browser and workbench checks outside this API change unless requested.

Verified in this worktree: `nub run link`, `nub run typecheck`, seven handshake cases, one send-receipt HTTP recovery case, one native two-attachment isolation case, the service-disposal regression, `lat check`, and `git diff --check`. All passed. The native isolation case connects to an isolated Prime Agent daemon and validates its managed handshake. Browser tests, the full service-restart suite, and supervisor-update fault injection were not run.

The remaining decisions are catalog coverage/fallback, native replay ownership, update reconnect coordination, and renderer teardown. None authorizes dependency changes, commits, pushes, merges, or a broader implementation by itself.
