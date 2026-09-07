# Prime Agent sessions

Ernie presents Prime Agent sessions as ordered, recoverable conversations with explicit draft and transport state.

Read the [data-structure guide](../docs/data-structures.md) for contract relationships, command identifiers, and state lifetime.

## Draft sessions

A draft session exists before its first user message and drives Ernie's new-session composition.

The shared contract is [[src/packages/prime-agent/index.ts#PrimeSessionSummary]]. UI terms remain aligned with the repository glossary.

## Command admission

One chat session owns an immutable send until admission is known. Main-service receipts prevent repeat dispatch within one service epoch.

[[src/packages/chat-session/index.ts#createChatSession]] shares pending work and preserves the original request during recovery. [[src/main/prime-agent/send-receipts.ts#SendReceipts]] retains receipt evidence and refuses stale epochs; uncertain native delivery never triggers automatic redelivery. Receipt inspection closes missing identities against late requests and never dispatches a message.

## Session synchronization

The workspace combines authoritative snapshots with ordered changes and recovers when continuity cannot be proven.

[[src/packages/prime-workspace/index.ts#createPrimeWorkspace]] coordinates attachment and recovery. [[src/packages/prime-agent/sync.ts#createPrimeSessionSyncState]] defines the initial synchronization state.

## Renderer projection

The renderer exposes session data through focused hooks while keeping transport and recovery handling inside its provider.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] owns the integration. Components consume focused hooks rather than raw Zenbu RPC or event streams.

## Agent appearance

Generated characters persist a seed, so navigation and reload preserve identity. Original character identifiers remain readable.

[[src/packages/agents/index.ts#Avatar]] parses saved appearance. [[src/renderer/components/generated-avatar.tsx#GeneratedCharacter]] derives SVG geometry, color, expression, and cosmetic motion. Reduced motion disables animation; blinking never establishes work state.

## Native Agent roots

Each Agent binds one durable Prime Agent root. Preparation writes the native file before activation; retries resolve the same identity. Legacy profiles with several sessions require a root choice and retain all earlier associations.

[[src/main/services/agents.ts#AgentsService]] owns serialized binding and presentation updates. [[src/main/prime-agent/service.ts#PrimeAgentService]] owns native activation, rename, and validated child inspection. [ADR 0002](../docs/adr/0002-native-agent-roots.md) records the ownership decision.

## Subagent roster inspection

Conversation activity exposes native child status, parent relationships, and reply previews without changing the selected session. Cached rosters remain inspectable with a last-known-state label.

[[src/renderer/components/subagent-activity.tsx#SubagentActivity]] owns preview selection and focus restoration. Parent links resolve only within the supplied roster. Previews preserve source attribution and add no daemon commands.
