# Prime Agent API reference

Versioned reference extracted from installed Prime Agent 0.9.3 declarations, protocol 7/schema 26. This describes available types, not commands executed or features exposed by Ernie. Re-extract after dependency upgrades.

## Choose an interface

Use Ernie’s main-service boundary for product controls. Use `DaemonAgentConnection` for a logical native attachment, and `DaemonClient` for raw protocol operations. Worker authentication and update internals require their own ownership contracts.

- [Ernie service methods](ernie-service.md)
- [Client and connection methods](clients.md)
- [Responses and events](responses-events.md)
- [Usage patterns](usage.md)
- [inspection](inspection.md): 17 command variants
- [agents-and-children](agents-and-children.md): 12 command variants
- [configuration](configuration.md): 19 command variants
- [lifecycle-and-tools](lifecycle-and-tools.md): 30 command variants
- [execution](execution.md): 21 command variants
- [scheduling](scheduling.md): 8 command variants

## Source and interpretation

Field tables are expanded with the TypeScript checker from `node_modules/prime-agent/dist/modes/daemon/daemon-protocol.d.ts`. Union variants retain their separate shapes. A command’s presence does not establish server capability negotiation, permissions, operational safety, or an Ernie UI control. Consult [capability coverage](../capabilities.md) before exposing one.
