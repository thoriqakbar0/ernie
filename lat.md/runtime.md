# Prime Agent runtime

Ernie projects Prime Agent daemon state into one typed session model shared by its main process and renderer.

## Session-state authority

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the session catalog and selected session identifier. The renderer subscribes to revisioned state and does not poll the daemon.

## Snapshot authority

[[src/packages/prime-agent/index.ts#PrimeSessionSnapshot]] is the authoritative displayed state for one session, including messages, useful activity, and transport status.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] exposes that state to the renderer without creating a second session model.

## Ordered synchronization

Each attachment starts from a snapshot envelope. Ordered changes apply only to the same session and generation at the expected revision.

[[src/packages/prime-agent/sync.ts#createPrimeSessionSyncState]] owns the synchronization state. Revision gaps, overflow, or generation changes require a fresh snapshot.

## Logical session isolation

One daemon client may carry several logical attachments. Each attachment keeps its own snapshot, events, commands, and disposal lifecycle.

[[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] provides the renderer-facing attachment boundary. [[tests#Behavior specifications#Daemon boundary#Logical attachment isolation]] proves the daemon behavior.

## Daemon ownership

Ernie manages the daemon it starts for an isolated profile. When `ERNIE_PRIME_AGENT_SOCKET` selects an external daemon, Ernie closes only its client.

[[src/main/prime-agent/service.ts#PrimeAgentService]] owns the main-process connection. [[development#Development workflow#Development profiles]] defines endpoint selection.

## External recovery

Failed external reconnects keep the last snapshot and pause commands. Ernie retries one connection attempt at a time until recovery or disposal.

[[src/main/prime-agent/recovery-retry.ts#runPrimeAgentRecoveryLoop]] stops retries during disposal.

[[tests#Behavior specifications#Development boundary#Browser recovery]] proves session recovery.

The external daemon and socket survive cleanup, as required by [[tests#Behavior specifications#Daemon boundary#External daemon ownership]].
