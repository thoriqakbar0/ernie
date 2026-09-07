# Capability map

This map separates installed upstream support from Ernie service integration. It does not promise every service method has a visible renderer control.

| Capability | Prime Agent side | Ernie side |
| --- | --- | --- |
| Catalog and selection | Native `list`, saved-session catalog, active IDs | Main-service catalog and selected logical session |
| Root identity | Create/resume from persisted session path; native rename | Prepared root binding and activation; see ADR 0002 |
| Transcript and activity | Attach snapshots and session events | Projected transcript, context, transport, revisioned updates |
| Prompt and follow-up | Prompt, steer, follow-up, queue operations | Prompt and follow-up with Ernie receipts; no general steer service method |
| Stop and idle | Abort and wait operations | `abort` and `waitForIdle`; idle does not prove success |
| Models and reasoning | Model catalog, model/thinking controls | Available models, model selection, effort, recurrent depth |
| Child inspection | RLM metadata and child snapshots | `inspectChild`; native identity required |
| Child mutation | Cancellation/deletion and other native operations | No general child-management service API in this audit |
| Agent messaging | Native peer messaging and delivery controls | No general peer-messaging service API in this audit |
| Schedules and heartbeats | Native worker scheduling and heartbeat commands | No schedule/heartbeat service API in this audit |
| Compaction and queue editing | Native compaction, retry, queue controls | No general management controls in this service |
| Bash and import/export | Native execution and session import/export commands | No general service endpoints in this audit |
| Recovery | Native journals, reconnect, replay and snapshot recovery | Attachment recovery plus an in-memory receipt ledger; no blanket exactly-once claim |
| Presentation metadata | Native runtime does not own Ernie appearance | Ernie roster appearance, favorites, selection context and draft state |

## Before exposing a native capability

Trace the installed command and its capability requirements. Define the Ernie owner, typed request/result, identity, failure behavior, and lifetime. Add a renderer control only after its interaction and recovery behavior are defined. Verify the real boundary with isolated data when testing is authorized.

Evidence: [main service](../../src/main/prime-agent/service.ts), [Agent service](../../src/main/services/agents.ts), [shared contracts](../../src/packages/prime-agent/index.ts), installed `prime-agent` daemon protocol and connection declarations. Re-audit this map when those owners change.
