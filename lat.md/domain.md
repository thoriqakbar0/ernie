# Prime Agent sessions

Ernie presents Prime Agent sessions as ordered, recoverable conversations with explicit draft and transport state.

Read the [data-structure guide](../docs/data-structures.md) for contract relationships, command identifiers, and state lifetime.

## Draft sessions

A draft session exists before its first user message and drives Ernie's new-session composition.

The shared contract is [[src/packages/prime-agent/index.ts#PrimeSessionSummary]]. UI terms remain aligned with the repository glossary.

## Command admission

One chat session owns prompt admission before it calls the Prime Agent client.

[[src/packages/chat-session/index.ts#createChatSession]] prevents overlapping draft submissions and returns an explicit accepted or rejected result.

## Session synchronization

The workspace combines authoritative snapshots with ordered changes and recovers when continuity cannot be proven.

[[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] coordinates attachment and recovery. [[src/packages/prime-agent/sync.ts#createPrimeSessionSyncState]] defines the initial synchronization state.

## Renderer projection

The renderer exposes session data through focused hooks while keeping transport and recovery handling inside its provider.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] owns the integration. Components consume focused hooks rather than raw Zenbu RPC or event streams.
