# Architecture

[ADR 0002](adr/0002-native-agent-roots.md) binds each Agent to one native root. Use the [code map](../lat.md/architecture.md) for implementation links and [data structures](data-structures.md) for protocol invariants.

## Ownership

| Responsibility | Owner |
| --- | --- |
| Execution, names, configuration, transcript, descendants | Prime Agent |
| Appearance, favorites, durable root binding, legacy origins | `AgentsService` and `AgentStoreService` |
| Revisioned catalog, selected session, attachments, receipts | `PrimeAgentService` |
| Renderer subscriptions, cache, commands | `PrimeAgentStateProvider` |
| Session admission and stop feedback | `ConversationFlowProvider` |
| Unsent text and draft versions | `ConversationDraftProvider` |
| Session reading positions | `MessageReadingProvider` |
| Shared appearance | StyleX theme and shared controls |

Renderer caches mirror accepted runtime state. Menus and other temporary presentation belong to their owning component. Drafts, reading positions, and feedback survive navigation, but not application reload.

### Prime Agent version boundary

Prime Agent and companion overrides use pinned GitHub release assets. The lockfile owns versions and integrity hashes. Managed sockets include the installed version: browser development and the service share one endpoint; desktop profiles use a versioned socket within their state directory. Explicit socket overrides remain external.

Before session commands, require protocol 7, schema revision 26 or newer, and matching package version for managed daemons. External daemons may report another package version when the protocol and schema match. Incompatibility closes only Ernie's client. An unavailable managed endpoint may start a daemon; external endpoints report failure without replacement.

Saved root files and native session leases remain authoritative across endpoint changes. Attachments use supervisor transport and catalog polling; roster subscriptions and direct transport require separate integration.

## Persistence and native identity

Effect owns validation, expected failures, serialization, and orchestration; Zenbu RPC exposes Promises. Zenbu's schema envelope uses Zod, with Effect Schema validating the roster.

Zenbu 0.6 swallows flush failures. `AgentStoreService` writes a fresh token, flushes, then verifies the token and roster on disk before reporting success. Retry forces a write even if in-memory settings already match.

Prepare and persist a root identity before native admission. Resume its exact `sessionPath`, restoring immutable execution origin while respecting native model changes. Reconciliation imports missing records, rejects conflicting identities or origins, and preserves current selection and assignments. Legacy reassignment preserves execution origin.

The stored selected Agent is navigation context. `PrimeAgentService` owns selected-session state; explicit visits update recency, streaming does not.

Resolve the active native ID from the catalog or saved root before constructing an attachment, so initial snapshot events match. Reserve attachment acquisition before asynchronous work; concurrent callers share its promise and generation. Recovery uses a captured session file or direct catalog lookup rather than awaiting itself.

## Conversation boundaries

Commands capture explicit session IDs and draft identity before asynchronous work. Navigation cannot relocate them. Clear submitted drafts by captured object identity, not text equality; later edits survive. Hidden mobile views must not overwrite reading positions with zero-sized layout observations.

`describeConversationActivity` parses supported tool output from the accepted snapshot. It adds presentation, not another transcript or execution authority. Current activity belongs to the session because the display contract does not map every event to a submitted message.

## Development scenarios

Fixtures use production components through injected clients and workspace providers. They own their subscriptions and cleanup and must not issue live commands. [Workflow](workflow.md#browser-scenarios) describes controls; [verification](verification.md) records remaining gaps.

Keep exact styles in source and update `lat.md/` links when code ownership changes. Use an ADR for durable product decisions; keep transient debugging evidence in the task.
