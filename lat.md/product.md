# Product contract

Ernie helps a developer direct several Prime Agent sessions without losing the selected workspace, transcript, or runtime state.

The detailed product source is [PRODUCT.md](../PRODUCT.md). Interaction and visual rules live in [docs/ui.md](../docs/ui.md).

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

The unselected workspace opens a centered first-message composer. Sending saves an Agent and starts its native conversation; opening the page creates nothing. Empty conversations retain Agent identity and editable drafts.

[[src/renderer/components/agent-welcome.tsx#AgentWelcome]] pairs the heading and procedural character previews with shared chat composition. [[src/renderer/components/draft-agent-settings-panel.tsx#DraftAgentSettingsPanel]] opens from the composer footer and docks optional draft settings in the sidebar and falls back below the composer when navigation is hidden or narrow. The form keeps ownership of local settings across placement changes. Draft settings use Base UI tabs for Customize and Folder, with keyboard navigation and a moving selection pill. The loaded empty sidebar shows a translucent procedural Agent. Decorative seeds remain stable across renders. [[src/renderer/components/empty-conversation.tsx#EmptyConversation]] introduces new work. [[src/renderer/components/chat-workspace.tsx#ChatWorkspace]] keeps creation feedback visible until session draft ownership transfers.

[[src/renderer/components/provider-brand.tsx#ProviderBrand]] owns local company marks and provider display names for the conversation model picker. Attribution follows the selected session model; an unresolved provider does not imply OpenAI.

Agent name suggestions use the existing different-name generator beside the name input. Undo restores the previous name; manual edits dismiss Undo. Avatar selection stays unchanged.

[[src/renderer/components/ui/animated-tabs.tsx#AnimatedTabs]] owns the reusable StyleX tab list and Base UI selection indicator, with controlled and uncontrolled selection and reduced-motion support.

Application settings and saved Agent controls also use AnimatedTabs. Saved Agent controls allow deselection to close their panel; application tabs retain URL navigation.

[[src/renderer/components/draft-model-picker.tsx#DraftModelPicker]] edits provider/model preferences before creation, using a session catalog when available or explicit IDs otherwise. First send validates the pair and saves it with the Agent.

Draft model selection uses the shared StyleX DropdownMenu backed by Base UI Menu, with radio items for catalog options and the runtime default. Custom IDs open in a separate dialog. Custom edits apply as a pair only on confirmation; dismissing discards them and returns focus to the trigger.

ProviderBrand includes local better-icons marks for OpenAI, Anthropic, Google, DeepSeek, xAI, Mistral, Groq, and OpenRouter. Provider matching ignores casing and surrounding whitespace; each brand preserves its source viewBox.

Refine is removed from Agent settings without deleting stored instructions. RuntimeStatus shows package versions and renderer catalog readiness in the workspace footer.

Before a session exists, getModels reads configured providers from Prime Agent’s local ModelRegistry without creating a session or refreshing credentials. Attached sessions retain their daemon-owned model catalog.

The draft model menu offers six configured models plus a searchable provider-tabbed full catalog. PrimeModel carries catalog input/output costs and availability; unavailable providers are visible but disabled. Date metadata is absent in the installed registry, so the UI explicitly uses numeric version/name ordering. Subscription model prices are not presented as per-token charges.

The full model catalog exposes primary provider tabs and an explicit Other providers selector, displays selected-model state, and consolidates setup instructions above rows marked Needs setup. Prices occupy their own line.

The model catalog now reads only configured Prime Agent providers. A single provider is a static label; multiple providers expose tabs. Unconfigured-provider browsing and repeated Ready/setup copy are removed.

Provider tabs in the model catalog stay on one horizontally scrollable row rather than wrapping.

Custom model ID fields are removed from Agent settings. The composer dropdown selects catalog models.

Failed first-message creation unlocks draft identity controls. Retries save current settings with the last acknowledged revision, preserving the Agent ID and creation request ID. Prepared roots retain immutable folder/model controls.

Pre-session model catalogs load in a bounded worker thread because Prime Agent registry construction reads files synchronously. Concurrent requests share in-flight work; only validated model metadata returns to the host.
