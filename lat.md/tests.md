---
lat:
  require-code-mention: true
---
# Behavior specifications

These specifications protect the product and runtime rules most likely to break across process boundaries.

## Development boundary

Development configuration must isolate state before it starts any process.

### Browser recovery

Browser development preserves a live session while its isolated Prime Agent daemon stops and restarts.

## Daemon boundary

Daemon connections must preserve logical session and process ownership.

### Logical attachment isolation

Two logical attachments sharing one daemon client receive only their own snapshots and session events.

### External daemon ownership

Stopping Ernie closes its connection but leaves an externally selected Prime Agent daemon and socket usable.
