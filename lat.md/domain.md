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

Subagent threads sit below the conversation header, separate from execution details. Native status and reply previews remain visible when execution details are collapsed. Cached rosters carry a last-known-state label.

[[src/renderer/components/subagent-activity.tsx#SubagentActivity]] owns child selection and a read-only side panel with a parent return path. [[src/renderer/components/subagent-conversation.tsx#SubagentConversation]] mounts native inspection only while open; failed refreshes preserve prior messages. ConversationMessages owns shared memoized message rendering without execution subscriptions. The parent draft stays attached; no child send, cancel, or resume action is exposed. Waiting derives only from native running activity waiting.

## Agent settings feedback

Agent edits remain local to the form until accepted by the save command. Unchanged forms cannot submit; rejected saves retain edits, and accepted saves announce success after closing.

[[src/renderer/components/agent-settings.tsx#AgentSettingsDialog]] compares edits with the opened values without changing optimistic revision checks. [[src/renderer/components/agent-settings.tsx#AgentControls]] owns the success announcement. Prepared roots keep instructions and working folders read-only; the folder remains visible in full.

## Session generation controls

Models expose native supported effort levels. Draft choices seed the native root; bound roots retain accepted settings across reopening. RLM max depth is a nonnegative safe integer and zero disables delegation.

[[src/main/prime-agent/model-catalog.ts#projectModelCatalog]] projects capabilities through the installed native helper. [[src/main/prime-agent/agent-config.ts#nativeConversationConfig]] supplies initial effort; prepared-root activation applies depth before first send. Live effort changes also update Prime Agent's default effort, while depth changes stay chat-local. Native depth defaults to 2 when no chat, inherited, global, or environment override exists.
