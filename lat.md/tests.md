---
lat:
  require-code-mention: true
---
# Behavior specifications

These specifications protect the product and runtime rules most likely to break across process boundaries.

## Development boundary

Development configuration must isolate state before it starts any process.

### Profile isolation

Two named profiles use separate state roots while preserving an explicitly selected port and role.

### Browser recovery

Browser development preserves a live session while its isolated Prime Agent daemon stops and restarts.

## Daemon boundary

Daemon connections must preserve logical session and process ownership.

### Logical attachment isolation

Two logical attachments sharing one daemon client receive only their own snapshots and session events.

### External daemon ownership

Stopping Ernie closes its connection but leaves an externally selected Prime Agent daemon and socket usable.

### Recovery cancellation

Disposal during a failed connection attempt ends recovery before the retry scheduler starts another delay.

## Synchronization boundary

Renderer state must accept only valid and ordered Prime Agent envelopes.

### Invalid payload rejection

Malformed envelopes and mismatched session identities fail before they enter synchronization state.

### Early change buffering

A change arriving before the first snapshot waits and applies after its preceding snapshot arrives.

### Discontinuity recovery

A revision gap or daemon generation change enters recovery instead of applying uncertain state.

### Covering snapshot authority

A recovery snapshot becomes authoritative only when it covers the newest observed revision.

## Renderer behavior

The renderer must keep session identity, activity, and transport state visible and consistent.

### Draft isolation

Switching sessions clears the previous session's unfinished draft instead of moving it to another session.

### Selection convergence

Rapid session changes converge on one heading and one current navigation marker.

### Activity document order

Session activity follows the conversation in document order so narrow layouts can place it in the reading flow.

### Failed transport

A failed connection stays visible and disables message and stop commands until the runtime recovers.
