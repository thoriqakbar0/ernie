# Product contract

Ernie helps a developer direct several Prime Agent sessions without losing the selected workspace, transcript, or runtime state.

The detailed product source is [PRODUCT.md](../PRODUCT.md). The interaction source is [docs/ui.md](../docs/ui.md), and the visual rules are [DESIGN.md](../DESIGN.md).

## Session continuity

Selecting a session changes its heading, transcript, activity, composer, and current marker together. Drafts and messages never cross session boundaries.

[[src/renderer/prime-agent-state.tsx#PrimeAgentStateProvider]] owns renderer selection and session state.

## Runtime states

Working, recovering, reconnecting, and failed states change visible actions and messages. The UI never invents progress, permission, or completion data.

These states depend on the authoritative contract in [[runtime#Prime Agent runtime#Snapshot authority]].

## Responsive workspace

The same production components run in browser development and Electron. Narrow windows show either the Agent list or the chat; selecting a row opens the chat.

[[src/renderer/components/app.tsx#App]] defines the main renderer layout.

## Product boundaries

The current UI does not add rename, archive, delete, retry, or permission commands. It does not replace the Prime Agent protocol or Zenbu view structure.

## Messaging Agents

Agents act as persistent contacts. One send creates and submits an empty Agent conversation; active conversations queue follow-ups. Activity remains session-scoped, and idle never proves task success.

[[src/renderer/conversation-flow.tsx#ConversationFlowProvider]] owns submission and stop feedback across navigation. [[src/renderer/components/prime-composer.tsx#PrimeComposer]] presents one input interaction for every chat state. See [UI guidance](../docs/ui.md#message-to-work-flow) for the complete flow.

## Conversation home

The unselected workspace introduces persistent Agents with a direct creation action. Empty conversations pair Agent identity with the composer and actual workspace; attachment preserves editable text.

[[src/renderer/components/agent-welcome.tsx#AgentWelcome]] opens the persisted settings flow. [[src/renderer/components/empty-conversation.tsx#EmptyConversation]] introduces new work. [[src/renderer/components/chat-workspace.tsx#ChatWorkspace]] keeps creation feedback visible until session draft ownership transfers.
