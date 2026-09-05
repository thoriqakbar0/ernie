# Data structures

Use this guide when changing session data, synchronization, command payloads, or UI state lifetime. The [shared contracts](../src/packages/prime-agent/index.ts) define exact fields. This guide explains their relationships and invariants without maintaining a second schema.

## Current session model

Ernie separates the session catalog from the detailed snapshot of an attached session:

```mermaid
flowchart TD
    catalog[PrimeSessionState] --> summaries[PrimeSessionSummary list]
    catalog --> selection[Optional selectedSessionId]
    selection -. selects by id .-> summaries
    envelope[PrimeSessionSnapshotEnvelope] --> snapshot[PrimeSessionSnapshot]
    snapshot --> summary[PrimeSessionSummary]
    snapshot --> messages[PrimeSessionMessage list]
    snapshot --> useful[PrimeUsefulSessionContext]
    snapshot --> transport[PrimeSessionTransport]
    changes[PrimeSessionChangeEnvelope] --> reconciliation[Ordered reconciliation]
    envelope --> reconciliation
    reconciliation --> accepted[Accepted renderer snapshot]
```

The catalog revision orders catalog and selection updates. Snapshot-envelope revisions order one attached session’s projected changes. They are separate revision streams and must not be compared with each other.

## Identity and state

The current types keep identity, execution, and connection health separate:

| Structure | Meaning | Invariant |
| --- | --- | --- |
| `PrimeSessionSummary` | Session identity, workspace, name, lifecycle, execution state, and optional model | Use `id` for identity; names and paths are not unique identifiers |
| `PrimeSessionState` | Catalog and optional selected session at one revision | Apply selection and catalog from the same accepted state |
| `PrimeSessionSnapshot` | Session summary, readable transcript, useful context, and transport | Render related session information from one accepted snapshot |
| `PrimeSessionMessage` | Identified transcript entry with role and text | A change can update an existing message by `id` |
| `PrimeUsefulSessionContext` | Structured messages, runtime details, family relationships, and replay position | Treat optional context as unavailable when absent |
| `PrimeSessionTransport` | Connected, reconnecting, or failed connection | A failed connection requires error information; it does not prove execution failed |

Lifecycle distinguishes `archived`, `draft`, and `live`. Execution state distinguishes `idle`, `working`, and `recovering`. Neither field substitutes for transport health. An archived lifecycle in the contract does not imply an archive control exists in the UI.

Structured and readable messages serve different consumers. Keep their projections aligned through the runtime boundary. Do not create an independent transcript authority in a component.

## Ordered synchronization

Snapshot and change envelopes carry `sessionId`, `generation`, and `revision`. The [synchronization module](../src/packages/prime-agent/sync.ts) parses these values and owns reconciliation.

Apply changes only to the matching session and generation at the next expected revision. Ignore already-applied revisions. Recover with a fresh snapshot when continuity cannot be established. An envelope’s session identifier must match its snapshot’s session identifier.

See the [runtime map](../lat.md/runtime.md#ordered-synchronization) for generation changes, revision gaps, and buffering limits. Keep these rules at the synchronization boundary rather than reimplementing them in UI components.

## Commands and admission

Command payloads identify the session independently of the currently selected UI:

| Contract | Purpose |
| --- | --- |
| `CreateSessionRequest` | Workspace and optional name for a new session |
| `AttachSessionRequest` | Session identity for attachment |
| `SendRequest` | Service epoch, command identity, session, immutable content, and prompt or follow-up mode |
| `SendReceipt` | Accepted, queued, definitely not sent, or unknown delivery outcome |
| `SessionAction` | Session-scoped operation such as stop or wait-for-idle |

[Chat-session coordination](../src/packages/chat-session/index.ts) owns pending prompt admission. Submission, admission, and completed execution are different outcomes. Keep their identifiers and visible feedback distinct.

## Lifetime and persistence

The [architecture guide](architecture.md#ownership) defines ownership across the runtime and renderer. Readonly TypeScript data does not itself define persistence or survival across remounts.

Before adding a value, establish its identity, owner, update source, and lifetime. Specify whether it survives session switching, component unmount, application restart, or reconnection. Derive values from existing state when they need no independent lifetime.

For a boundary change, update its TypeScript contract, parser, producer, consumer, and relevant fixture together. Check the affected integration boundary when verification is authorized. Keep JSON-safe projections explicit at process boundaries.

## Persistent Agent records

[Agent contracts](../src/packages/agents/index.ts) define Effect schemas for the Zenbu roster. Agent UUIDs remain stable across name and workspace changes. Settings revisions reject stale edits; instruction revisions advance only when instructions change. Favorites use the persisted `pinned` field without changing creation order.

An association maps one logical Prime session ID to an Agent ID or `null`, with explicit visit recency. Its optional immutable origin records the creating Agent, instruction revision and text, workspace, and provider/model defaults. Reassignment preserves origin. Legacy sessions have no origin or association until explicitly organized; neither absence implies an Agent assignment.

Creation request IDs support retry after a persisted creation succeeds. A created session whose assignment fails remains reachable through unassigned history. The service persists origin before reporting creation success. Expected mutation failures return a typed result and keep renderer form data available.

The catalog projection includes optional activity summary, activity timestamp, and explicit worker failure. Roster previews aggregate concurrent states without using idle as a completion signal. Conversation title is the fallback when activity text is unavailable.

Draft text lives in an application-scoped, session-keyed map. Submission clears only the draft entry captured when the action started. Empty-Agent creation transfers the current draft version into the created session, while sending the originally captured message. Later edits survive a delayed response, including identical text reentered after navigation. It is not stored in Zenbu or sent to Prime Agent until submission. Agent records and associations survive browser reload; unsent text does not.

See [architecture ownership](architecture.md#agent-organization-boundary) for native configuration and [verification](agent-roster-verification.md) for integration coverage.

The Zenbu envelope also stores `rosterWriteId`, a fresh write acknowledgement token. Development profiles have separate Zenbu databases even when they share native Prime sessions. Explicit reconciliation adds missing records and origins without replacing existing assignments or execution configuration.

## Conversation interaction lifetime

Submission feedback distinguishes idle, creating, sending, accepted, queued, unknown, and error states. Stop feedback has its own idle, stopping, and error states. Both remain session-keyed outside mounted workspace components. An empty Agent initially uses its Agent draft key; creation associates subsequent submission feedback with the returned session ID.

Runtime admission and queued follow-up acknowledgement are separate outcomes. The send receipt preserves one command identity across prompt and follow-up recovery; acknowledgement does not establish that the instruction has executed. No new task or unread record is persisted.

Reading positions store a scroll offset and whether the reader was at the end, keyed by session for the application lifetime. Tool-output presentation accepts the native `toolResult` shape and only supported text content, preserving the tool error flag without interpreting it as overall task completion.

## Send receipts and recovery

The chat coordinator reserves a command ID and the service epoch before calling `sendMessage`. It retains the original session, content, and mode until delivery is confirmed or the user explicitly releases uncertainty. Concurrent callers share one pending result. Recovery uses the original request even if the draft changes or the session starts working.

`PrimeAgentService` parses the request and reserves its receipt before native dispatch. Repeated IDs share the same pending or completed result. A changed payload with the same ID returns unknown. Preparation failures return not-sent; a subsequent user retry can create a new identity because no message entered native dispatch. Errors after dispatch starts return unknown and never trigger automatic redelivery.

A lost renderer RPC response can recover a completed receipt through Check send. A lost native acknowledgement remains unknown: the installed Prime Agent admission IDs support cancellation, not durable deduplication or passive status lookup. Ernie does not infer admission from matching transcript text. The user can inspect the conversation and explicitly allow a new send, which may duplicate an earlier message.

Follow-ups inspect the native `queued` result. A false result means Prime Agent did not add another equivalent pending follow-up; Ernie retains the draft. Accepted and queued receipts describe admission, not eventual execution or successful completion.

Receipts belong to the main-service instance and are not durable. A random epoch prevents a surviving renderer request from being redelivered after that owner restarts. The ledger retains up to 10,000 identities and rejects new ones at capacity instead of evicting deduplication evidence. Settled entries retain a SHA-256 payload fingerprint and outcome, not message text. Renderer draft and unresolved-send identity still disappear on browser reload; no background outbox or crash-safe exactly-once guarantee exists.
