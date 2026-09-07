---
lat:
  require-code-mention: true
---

# Behavior specifications

These specifications protect the product and runtime rules most likely to break across process boundaries.

## Development boundary

Development configuration must isolate state before it starts any process.

### Browser recovery

Browser development discovers an external session without reloading. It preserves that session while its isolated Prime Agent daemon stops and restarts.

## Daemon boundary

Daemon connections must preserve logical session and process ownership.

### Logical attachment isolation

Two logical attachments sharing one daemon client receive only their own snapshots and session events.

### Explicit connection recovery

Startup connects without session mutations. Missing installations and incompatible greetings stop safely; explicit retry resets recovery. Concurrent callers share the client and disposal preserves the external endpoint.

### Installed daemon startup

Disposable executables prove version output on stdout or stderr, supported launch arguments, installation failures, bounded retries, environment isolation, and daemon survival after client disposal.

### External daemon ownership

Stopping Ernie closes its connection but leaves an externally selected Prime Agent daemon and socket usable.

### Send receipt recovery

Receipt inspection never dispatches, even when the original request arrives late. Concurrent attachments share a generation. Restart recovery resolves the native active ID before consuming snapshot events.

### Service disposal

Service shutdown joins pending native attachment cleanup, rejects later acquisition without opening a socket, and leaves the external endpoint available.

### Refresh burst coalescing

Bursts share queued projection work while preserving events received during a native read. A socket fixture measures full-transcript projections and verifies the final published session state.

### Renderer event routing

Serialized broadcasts reach only subscribed renderer attachments. Invalid observed envelopes remain rejected; listener removal and disposal stop delivery, and new subscriptions resume validated updates.
