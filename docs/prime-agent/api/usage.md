# API usage patterns

These examples illustrate the installed 0.9.3 client contract. They are documentation examples, not executed operations. Use an explicitly chosen socket and an isolated session for experiments.

## Read the catalog

Keep the native response as unknown until the consuming boundary parses its expected payload. Close a client when its owning scope ends.

```typescript
import { DaemonClient } from "prime-agent"

export async function readCatalog(socketPath: string): Promise<unknown> {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect(500)
    const hello = await client.waitForHello(1_000)
    if (hello.protocol.version !== 7 || (hello.schemaRevision ?? 0) < 26) {
      throw new Error("Incompatible daemon")
    }
    const response = await client.request({ type: "list", all: true })
    if (!response.success) throw new Error(response.error)
    return response.data
  } finally {
    client.close()
  }
}
```

For production Ernie changes, use the existing `connectPrimeDaemon` validator, which additionally checks the protocol name and managed daemon app version. Translate expected failures through the application's typed error boundary.

## Inspect an existing attachment

Resolve the active runtime ID from the catalog; do not substitute the durable logical session ID. A shared client outlives individual attachments.

```typescript
import { DaemonAgentConnection, type DaemonClient } from "prime-agent"

export async function inspectSession(client: DaemonClient, activeSessionId: string) {
  const connection = await DaemonAgentConnection.attach(client, activeSessionId, {
    closeClientOnDispose: false,
    directTransport: false,
    sendClientEnv: false,
  })
  try {
    return await connection.getState()
  } finally {
    await connection.dispose()
  }
}
```

This does not send a prompt, but attaching still creates a client attachment. Avoid `ownedSession` for a passive inspection because it changes disposal ownership.

## Follow-up results

Ernie reads the raw response because the convenience method discards whether an equivalent follow-up was already queued. This is a mutating operation; it belongs behind the existing send-receipt owner.

```typescript
const response = await client.request({
  type: "follow_up",
  activeSessionId,
  message,
})
```

Check `success`, then parse `data` with the existing Effect Schema for `{ queued: boolean }`. A false result must not clear the draft as though a new message was accepted. An accepted prompt or queued follow-up is not proof of completed work.

## Recovery and capability checks

`supportsServerCapability` checks the negotiated server capability. `enableRequestRecovery` preserves in-flight identities across reconnect; it does not establish a durable application outbox. `enableAutoReconnect` needs a daemon recovery owner and bounded policy.

A caller already owning a bounded recovery loop must inspect `request` options: `recoverable: false` prevents parking a request on a reconnect that only that caller can initiate. Do not mix automatic reconnect and application retry loops without assigning ownership.

Use the [responses and events](responses-events.md) reference for structured failures, greetings, snapshots, and closing reasons. The exact protocol declarations remain authoritative for nested types and capability metadata.
