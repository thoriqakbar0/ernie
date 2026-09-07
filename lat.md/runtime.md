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

Ernie connects to an existing user daemon and closes only its client. `ERNIE_PRIME_AGENT_SOCKET` overrides the upstream default socket.

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the main-process connection. [[development#Development workflow#Development profiles]] defines endpoint selection.

## External recovery

Failed external reconnects keep the last snapshot and pause commands. Ernie retries one connection attempt at a time until recovery or disposal.

[[src/main/prime-agent/recovery-retry.ts#runPrimeAgentRecoveryLoop]] stops retries during disposal.

[[tests#Behavior specifications#Development boundary#Browser recovery]] proves session recovery.

The external daemon and socket survive cleanup, as required by [[tests#Behavior specifications#Daemon boundary#External daemon ownership]].

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
