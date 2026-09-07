# Prime Agent runtime

Ernie projects Prime Agent daemon state into one typed session model shared by its main process and renderer.

## Session-state authority

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the session catalog and selected session identifier. The renderer subscribes to revisioned state and does not poll the daemon.

## Snapshot authority

[[src/packages/prime-agent/index.ts#PrimeSessionSnapshot]] is the authoritative displayed state for one session, including messages, useful activity, and transport status.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] exposes that state to the renderer without creating a second session model.

Event bursts share one queued snapshot refresh per attachment. Events during an active read retain one follow-up, so newer native state is still projected without accumulating duplicate transcript work.

## Ordered synchronization

Each attachment starts from a snapshot envelope. Ordered changes apply only to the same session and generation at the expected revision.

[[src/packages/prime-agent/sync.ts#createPrimeSessionSyncState]] owns the synchronization state. Revision gaps, overflow, or generation changes require a fresh snapshot.

## Renderer event routing

Renderer clients inspect session identity before parsing broadcast transcripts. Only locally subscribed sessions require deep validation; accepted events still pass the complete envelope parser.

[[src/packages/prime-agent/zenbu.ts#createZenbuPrimeAgentClient]] owns routing and listener cleanup. This avoids repeated transcript traversal in renderers that do not observe the session, without changing main-process broadcasts or attachment retention.

## Logical session isolation

One daemon client may carry several logical attachments. Each attachment keeps its own snapshot, events, commands, and disposal lifecycle.

[[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] provides the renderer-facing attachment boundary. [[tests#Behavior specifications#Daemon boundary#Logical attachment isolation]] proves the daemon behavior.

## Daemon ownership

Ernie connects first and starts an already installed daemon only when the endpoint is absent. It never installs or terminates Prime Agent. `ERNIE_PRIME_AGENT_SOCKET` selects the endpoint.

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the main-process connection. [[development#Development workflow#Development profiles]] defines endpoint selection.

## External recovery

Failed reconnects preserve snapshots and pause commands. Recovery stops after three attempts; missing installations and incompatible greetings stop immediately. Explicit retry resets the budget.

[[src/main/prime-agent/recovery-retry.ts#runPrimeAgentRecoveryLoop]] bounds retries and stops during disposal. [[src/main/prime-agent/installed-daemon.ts#InstalledPrimeDaemon]] discovers installed executables and retains launched process lifetime. Startup readiness has a 30-second deadline.

[[tests#Behavior specifications#Development boundary#Browser recovery]] proves session recovery.

The external daemon and socket survive cleanup, as required by [[tests#Behavior specifications#Daemon boundary#External daemon ownership]].

## Connection footer

[[src/renderer/components/runtime-status.tsx#RuntimeStatus]] shows connection status and the Ernie version. A native Connection details disclosure separates the live Prime Agent version from the installed client version.

Disconnected states retain visible diagnostics and the existing retry action. Connected status reads “Connected to Prime Agent” without repeating version metadata in the main line.

## Service shutdown

Shutdown rejects new attachment acquisition, closes the shared transport, and joins pending attachment and recovery work before cleanup completes.

[[src/main/prime-agent/service.ts#PrimeAgentService]] releases acquisitions that finish during disposal. Closing the client rejects pending native requests without issuing daemon shutdown. [[tests#Behavior specifications#Daemon boundary#Service disposal]] verifies this boundary.

## Daemon integration reference

The [daemon docs](../docs/prime-agent/README.md) separate Ernie ownership from upstream capability, including version evidence and recovery limits.

The [API reference](../docs/prime-agent/api/README.md) inventories installed command fields and client methods, with Ernie service signatures and example ownership patterns.

## Saved Agent selection

Selecting a saved Agent keeps the active native session until root activation selects the replacement.

Automatic renderer reconnect attempts belong to the roster provider, so workspace remounts reuse the same attempt; failed attempts require explicit retry.

See `src/main/services/agents.ts`, `src/renderer/agent-state.tsx`, and `src/renderer/components/reconnect-agent.tsx`.
