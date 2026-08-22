# Prime Agent client design

## Purpose

Ernie uses one native Rust client for Prime Agent's local daemon. Prime Agent owns session state and worker lifetime. The client owns connection recovery, request identity, response correlation, and one selected-session projection.

The protocol contract comes from Prime Agent commit `e319a66d7351c75abe7f040d02d9a8d6e25028e9`. The current contract uses protocol version 7 and schema revision 22. Ernie does not use its TypeScript adapter as a design source.

## Public use

The public API exposes typed operations for current Ernie behavior.

```rust
let client = DaemonClient::connect(DaemonEndpoint::discover()?.0).await?;
let sessions = client.list_sessions().await?;

let active_id = sessions
    .iter()
    .find_map(|session| session.active_id())
    .cloned()
    .ok_or(AppError::NoLiveSession)?;
let attachment = client.attach_session(active_id).await?;
let mut updates = attachment.subscribe();
```

`DaemonCommand`, raw command responses, daemon events, command identifiers, and cursors stay private. Callers cannot send `ack_result` or bypass compatibility checks.

## Ownership

One driver actor owns these values:

- The random client UUID and the monotonic command counter.
- The Unix socket and the accepted `daemon_hello`.
- Frozen command envelopes and their callers.
- Late-response tombstones.
- Best-effort acknowledgement debt.
- The selected attachment reducer.

No request task or GPUI entity writes the actor's maps. `AttachmentReducer` is a synchronous state machine. The actor applies its publish and resync effects.

`RootView` retains `DaemonClient` for its lifetime. A row selection starts one retained attachment task. `SessionSelectionModel` rejects updates whose selection token is stale.

## Commands and recovery

Each client uses `ernie-gpui:<uuid>` as its `clientId`. Each admitted command uses the next checked counter under that client identity. A reconnect preserves both values.

The actor serializes an envelope once and stores its bytes before the first socket write. After a transport loss, it rechecks compatibility against the new greeting and writes the same bytes. It never rebuilds a retained mutation with a new identifier.

Read commands use bounded deadlines. Immediate commands use 3 seconds, normal reads use 10 seconds, and interactive mutations use 30 seconds. Completion commands have no client deadline. A timed-out read leaves a bounded 60-second tombstone, so its late response does not stop the driver. A timed-out mutation reports `RequestError::OutcomeUncertain` and remains eligible for exact replay.

The daemon error code `command_result_uncertain` maps to the same typed outcome. A terminal mutation response creates a private `ack_result` envelope. Prime Agent sends no response for `ack_result`. The actor clears acknowledgement debt only after the local socket write succeeds. Protocol version 7 cannot prove that the daemon persisted the acknowledgement.

## Compatibility

The private command registry checks static protocol, schema, and capability requirements before each write and replay. It also checks the five field-sensitive rules in the pinned contract:

- `recoveryConfig` requires schema 17 and `owned_session_recovery_context`.
- `telemetryDisabled` requires schema 14.
- `admissionId` requires schema 8 and `prompt_admission_cancellation`.
- `waitForRlmQuiescence` requires schema 18 and `rlm_quiescence_barrier`.
- `cancelOwned` requires schema 20 and `owned_prompt_cancellation`.

A missing optional capability rejects only the affected operation. It does not stop connection startup or unrelated commands.

Run the contract checker against a Prime Agent checkout:

```sh
just check-prime-agent-protocol /path/to/prime-agent
```

The checker reads the pinned file through `git show`. It compares the protocol version, schema revision, 102 command names, 20 outbound records, and the five conditional gate markers. It does not run Prime Agent TypeScript.

## Attachment continuity

The actor registers the selected reducer before it writes `attach`. Events that arrive before the response enter a 256-record buffer.

The reducer accepts either an inline snapshot or a chunked snapshot. Chunked assembly checks the snapshot identity, unique and contiguous chunk indexes, declared chunk count, message count, a 16 MiB total size, and a 30-second transfer deadline.

After snapshot installation, the reducer accepts duplicate cursors without changing state. It accepts only the next sequence in the current generation. A gap, a generation change, a malformed stream, a missing cursor, or an early-buffer overflow requests one coalesced full snapshot. Three consecutive failed resyncs make the attachment unavailable.

After reconnect, the actor sends `attach` with the last accepted `resumeCursor`. It never sends `reattach`. If the reducer has no accepted cursor, the actor requests a full attachment snapshot.

`AttachedSession` is an Ernie projection. It contains the session identity, activity, working directory, snapshot message count, and a local revision. Opaque Prime Agent state and transcript values remain private. A contiguous event advances the revision. The next authoritative snapshot replaces the projected fields.

## Verification

Fake-daemon tests cover random client identity, monotonic command identifiers, byte-identical mutation replay, late responses, uncertain outcomes, response-less acknowledgements, compatibility rejection, early events, inline snapshots, streamed snapshots, and reconnect attachment cursors.

The ignored live test needs `PRIME_AGENT_DAEMON_SOCKET` to name a running protocol 7 daemon. Full restart verification remains blocked when no live daemon socket is available.
