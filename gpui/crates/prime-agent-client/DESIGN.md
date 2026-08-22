# Prime Agent client design

## Problem

Ernie GPUI needs a native Rust client for Prime Agent's local daemon. Prime Agent owns session state and lifetime. The client must validate every JSONL message, finish the daemon greeting before commands, correlate concurrent responses, and later recover attached sessions from authoritative snapshots. The current Ernie TypeScript adapter is not a design source.

## Usage

```rust
let client = DaemonClient::connect(DaemonEndpoint::at(socket_path)?).await?;
let sessions = client.list_sessions().await?;
```

The caller receives daemon domain values. It never handles JSON, request identifiers, socket ownership, protocol envelopes, or response routing.

## Shape

`DaemonClient::connect` returns only after a valid `daemon_hello`. One private driver owns the Unix socket and every pending request. A synchronous `ProtocolCore<T>` owns greeting state, request identifiers, command expectations, and completion tokens. The driver performs asynchronous I/O and applies the core's deterministic decisions.

The driver limits each JSONL frame to 4 MiB. It removes requests that exceed their three-second deadline and returns `RequestError::TimedOut` to the caller.

The protocol boundary accepts `prime-agent.daemon` version 7. Schema identity and revision remain diagnostic compatibility metadata. Optional capabilities gate optional behavior. This follows Prime Agent's live protocol and keeps compatible older schema revisions usable.

The first slice implements handshake, capability inspection, `list`, typed success and failure responses, request correlation, deterministic protocol tests, and a real-daemon test. It does not retry commands.

Future attachment support stays behind `DaemonClient::attach_session`. The driver will own the cursor, install one observation before sending attach, buffer early events until the authoritative snapshot arrives, and force snapshot replacement after gaps, generation changes, replay failure, or bounded queue overflow.

## Module map

- `lib.rs` owns the public domain values and typed errors.
- `client.rs` owns `DaemonClient` and the private socket driver.
- `protocol.rs` owns private wire records, parsing, validation, correlation, and later cursor transitions.

One request crosses at most these three files. No GPUI type enters the crate.

## Synthesis decision

The pure protocol core with one private driver won the architecture arena. It scored highest because deterministic tests cover the hardest protocol rules while callers retain one small client.

The synthesis keeps the split candidate's late-response and bounded-delivery rules. It keeps the actor candidate's attach buffering and single-attachment rule. It rejects the split public handle pair, public cursors, multi-session feed maps, exact schema equality, and matching the daemon-assigned greeting client ID against the command client ID.

## Tradeoffs accepted

- We accept one private driver thread in exchange for runtime independence and one mutable-state owner.
- We accept a small session projection in exchange for insulation from unrelated daemon fields.
- We accept terminal protocol errors in exchange for never returning miscorrelated data.
- We accept no retry in the first slice in exchange for honest command outcomes.

## Alternatives considered

A public command handle and event subscription exposed lifetime coordination to callers. A monolithic actor without a pure core made protocol correlation harder to test without I/O. A public typestate client exposed handshake mechanics that `connect` can hide completely.

## Open risks

- Attachment projections must remain smaller than Prime Agent's full wire snapshot.
- Mutation recovery needs stable command identity and explicit uncertain-result handling before any retry.

## Next implementation step

Implement greeting and correlated `list` through the pure core and prove both against a real Prime Agent daemon.
