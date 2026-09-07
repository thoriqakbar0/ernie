# Data structures

[Shared contracts](../src/packages/prime-agent/index.ts) own exact fields. This guide records invariants that producers, parsers, and consumers must preserve together.

## Catalog and snapshots

`PrimeSessionState` contains summaries and selection at one catalog revision. `PrimeSessionSnapshot` combines a session summary, readable messages, structured context, and transport health. Render related information from one accepted snapshot.

Catalog revisions and per-session snapshot revisions are separate streams. Names and paths are not identifiers. Message updates match by message ID. Missing optional context means unavailable, not empty.

Lifecycle (`archived`, `draft`, `live`), execution (`idle`, `working`, `recovering`), and transport health are independent. A failed connection does not establish failed execution; an archived contract value does not imply an archive control exists.

## Ordered synchronization

[The synchronization module](../src/packages/prime-agent/sync.ts) parses envelopes and owns reconciliation. Apply only the matching session and generation at the next revision. Ignore already-applied revisions; recover with a snapshot when continuity fails. Envelope and snapshot session IDs must match.

[The runtime map](../lat.md/runtime.md#ordered-synchronization) describes generation changes, gaps, and buffers. Components consume accepted state instead of implementing another reconciliation path.

## Persistent Agent records

[Agent schemas](../src/packages/agents/index.ts) own roster data. UUIDs survive edits; settings revisions reject stale writes. Instruction revisions change only with instructions. Favorites preserve creation order. Generated avatars persist a seed rather than SVG and compare by value across RPC.

A root stores durable native ID and file. `prepared` records identity before activation; `bound` records acknowledged activation. Absent roots represent unbound or legacy profiles. Availability is derived from the catalog and attachment, not another persisted status.

Preparation materializes a root beside the profile database in a directory keyed by the Agent ID's hash. Retry opens the same file. Native leases prevent duplicate residency. Missing bound files fail visibly without allocating replacements.

Legacy associations preserve membership and immutable origin: original Agent, instructions/revision, workspace, and model defaults. They do not drive normal Agent navigation. One legacy session may bind directly; several need explicit selection. Preserve other session files. Bound roots cannot be reassigned or duplicated by import.

Native names drive display and collision checks; rename detects stale expected names. Avatar and favorites remain Ernie metadata. Instructions and folder are fixed after preparation. Model changes remain native. Resume without a recorded origin must not fabricate configuration.

Native family data distinguishes an unsupported roster from an empty roster and separates child completion from explicit reply receipts. Inspection validates the child registry ID, parent identity, saved-file reference, and depth before reading. A retained child without an active worker can open its validated saved transcript.

## Interaction lifetime

[Architecture](architecture.md#ownership) assigns owners. Creation, sending, accepted, queued, unknown, and error feedback stays session-keyed outside workspace mounts. Stop has separate pending/error state. New-Agent sends save settings with a stable identity before opening the root; rejected attempts retain the same settings and message. Empty-Agent drafts transfer to the returned session; early native selection must not erase pending creation feedback.

Reading positions retain offset and whether the reader was at the end. Drafts, reading positions, and unresolved renderer requests live in application memory and disappear on reload.

## Send receipts and recovery

The coordinator reserves command ID and service epoch before sending. Original session, content, and mode stay immutable until delivery is confirmed or uncertainty is explicitly released. Concurrent callers share one result.

The service reserves the receipt before native dispatch. Repeated IDs reuse it; a changed payload returns unknown. Preparation failure returns not-sent and permits a fresh user retry. Failure after dispatch begins returns unknown and never triggers automatic redelivery.

Check send calls `checkSend`, which never attaches or dispatches. An absent receipt is recorded as not-sent so a delayed original request receives the same outcome. Receipt inspection remains available while disconnected.

A lost native acknowledgement remains unknown. Native admission IDs support cancellation, not durable deduplication or passive lookup. Matching transcript text is not proof of admission. Explicit resend can duplicate work and must remain the user's decision.

Follow-ups use native `queued`: false means no additional equivalent item was queued, so retain the draft. Accepted and queued describe admission, not completed execution.

Receipts are not durable. A random service epoch prevents redelivery after owner restart. The ledger retains up to 10,000 identities and rejects new ones at capacity instead of evicting deduplication evidence. Settled entries retain a SHA-256 payload fingerprint and outcome, not message text. There is no background outbox or crash-safe exactly-once guarantee.
