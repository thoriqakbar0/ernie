# Architecture for changes

Use this guide when a change affects state ownership, component boundaries, or runtime integration. The [architecture map](../lat.md/architecture.md) links current responsibilities to source code. This guide explains how to extend those boundaries.

## Current structure and product direction

Ernie currently renders Prime Agent sessions through React and Zenbu. The [domain map](../lat.md/domain.md) describes session admission, synchronization, and renderer projection.

Read [data structures](data-structures.md) for contract relationships, identifiers, revisions, and state lifetime.

[ADR 0001](adr/0001-persistent-agent-product-model.md) defines the accepted direction toward persistent Agents and related conversations. Persistent Agent identity and conversation organization are implemented. Routines, memory, and task surfaces remain target capabilities.

## Ownership

Assign each value and effect one owner before changing its presentation:

| Responsibility | Owner | Change rule |
| --- | --- | --- |
| Session execution and transcript | Prime Agent, exposed through Ernie’s main-process boundary | Use authoritative snapshots and ordered updates |
| Agent identity, defaults, and associations | `AgentsService` and `AgentStoreService` in the main process | Parse with Effect Schema and persist through Zenbu; serialize mutations |
| Catalog and selected session | Revisioned state published by `PrimeAgentService` | Keep selection and catalog changes consistent |
| Send identity and receipt recovery | Chat coordinator and main-service receipt ledger | Preserve immutable requests; see [send receipts](data-structures.md#send-receipts-and-recovery) for uncertainty and lifetime |
| Renderer subscriptions, cache, and commands | `PrimeAgentStateProvider` and its runtime | Expose focused hooks; keep transport mechanics here |
| Feature interaction | Workspace, composer, transcript, and navigation components | Coordinate behavior within the affected feature |
| Temporary presentation | The nearest component that owns its lifetime | Keep menu visibility and similar state local |
| Shared appearance and controls | StyleX theme, colocated style modules, and `components/ui/` | Reuse established styles and interaction behavior |

Derived values stay derived. A renderer cache mirrors server state; it does not create another authority for that state.

`ConversationDraftProvider` owns session-keyed unsent text for the application lifetime. Empty Agent drafts have a separate Agent key. Creation transfers their current version to the session while submission uses the captured message; later edits remain visible. Session components remount safely without sharing text. Reloading the application clears this temporary state.

## Component boundaries

Extract a component when it owns a coherent interaction or an established repeated pattern. Keep feature policy with the feature. Shared controls own reusable interaction and appearance, not session commands.

Use the existing dependencies and public package entry points. Add a boundary when it hides real policy, resource ownership, or external translation. A folder or wrapper alone does not establish that boundary.

Follow the [StyleX map](../lat.md/styling.md) for component styles and theme values. Keep document defaults in `main.css`.

## Development scenarios

Controlled scenarios should render production components through the existing client boundary. `PrimeAgentStateProvider` accepts a client and workspace-path provider. The development-only mock accepts initial snapshots.

The development-only `?browser=1&scenario=agents` route renders production roster, settings, and workspace components with isolated clients. It does not attach to live Prime sessions. See [verification](agent-roster-verification.md) for its presets and evidence limits.

Keep fixtures and their actions separate from live sessions. Give subscriptions, timers, and pending operations explicit cleanup. Scenario behavior verifies presentation; live runtime evidence verifies integration.

## Recording a decision

Update the linked `lat.md/` section when ownership or a runtime contract changes. Use an ADR for a durable decision with alternatives and consequences. Keep transient debugging notes and screenshot paths in the task handoff.

For visual behavior, read [UI guidance](ui.md). For the inspect, edit, and review sequence, read the [development workflow](workflow.md).

## Agent organization boundary

`AgentsService` exposes typed creation, editing, pinning, selection, and assignment through Zenbu RPC. Effect owns validation, expected failures, serialized mutations, and asynchronous orchestration; Promises appear at the RPC boundary. `AgentStoreService` stores the roster in the existing Zenbu database. Each write changes a persistence token, flushes, and reads back the token and roster from disk before reporting success. Zenbu 0.6 swallows flush errors, so awaiting flush alone does not establish durability. A retry forces another write even when the in-memory settings already match. The Zenbu schema adapter uses its required Zod envelope; Effect Schema validates the roster itself.

`PrimeAgentService` owns the single authoritative selected session. The stored selected Agent is navigation context, not a second selected session. Selecting an empty Agent clears session selection. Explicit conversation visits update recency; streaming activity does not.

Conversation creation saves immutable execution origin and uses native `appendSystemPrompt`, workspace, provider, and model configuration. Native resume restores the saved instructions and workspace through `sessionPath`; it respects model changes already persisted by Prime Agent. Reassignment and later Agent edits preserve origin. No chat messages or repository instruction files substitute for native configuration.

`reconcileRoster` imports missing records and immutable origins from another profile, rejects conflicting identities or origins, and preserves current selection and assignments. Recovery captures the session file when attachment succeeds; if needed, it queries the native catalog directly instead of waiting on its own recovery promise.

## Conversation interaction ownership

`ConversationFlowProvider` owns session-scoped admission and stop feedback for the application lifetime. It captures draft identity before starting an operation and uses explicit session IDs for subsequent commands. First-message creation reuses an Agent creation request ID, then uses the returned session for submission. Navigation does not relocate the command or erase its feedback. Expected creation and command failures become visible state through Effect; uncertain command outcomes are not automatically retried.

`ConversationDraftProvider` captures object identity, not string equality, when clearing submitted text. `MessageReadingProvider` stores per-session scroll positions in application memory; transcript remounts restore them. Hidden mobile views do not overwrite positions with zero-sized layout observations.

`describeConversationActivity` parses supported structured tool results with Effect Schema and projects presentation values. It consumes the existing accepted snapshot and creates no independent execution authority. The transcript places this projection in a session-level disclosure because the current display contract does not map every event to a submitted message.

## Native attachment identity

A logical session ID survives runtime restarts. Native snapshot events identify the current active session. Ernie resolves that active ID from the daemon catalog, or resumes the saved session, before constructing its logical connection. Otherwise, the connection can discard the beginning of a snapshot before the attach response updates its identity.

Attachment acquisition reserves a shared promise before asynchronous cleanup or connection setup. Concurrent renderer calls receive one attachment generation. If recovery installs an attachment during client acquisition, the caller uses that attachment.
