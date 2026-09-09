# scheduling API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## cron_list

| Field             | Required | Type      |
| ----------------- | -------- | --------- |
| `activeSessionId` | no       | `string`  |
| `includeInactive` | no       | `boolean` |

## heartbeats_list

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | no       | `string` |

## heartbeat_manage

| Field             | Required | Type                             |
| ----------------- | -------- | -------------------------------- |
| `activeSessionId` | yes      | `string`                         |
| `jobId`           | yes      | `string`                         |
| `action`          | yes      | `AgentHeartbeatManagementAction` |

## cron_add

| Field                 | Required | Type      |
| --------------------- | -------- | --------- |
| `activeSessionId`     | yes      | `string`  |
| `schedule`            | yes      | `string`  |
| `prompt`              | yes      | `string`  |
| `promoteOwnedSession` | no       | `boolean` |

## cron_cancel

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | no       | `string` |
| `jobId`           | yes      | `string` |

## heartbeat_get

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## heartbeat_set

| Field                 | Required | Type                         |
| --------------------- | -------- | ---------------------------- |
| `activeSessionId`     | yes      | `string`                     |
| `schedule`            | yes      | `string`                     |
| `prompt`              | yes      | `string`                     |
| `deliveryMode`        | no       | `AgentHeartbeatDeliveryMode` |
| `promoteOwnedSession` | no       | `boolean`                    |

## heartbeat_update

| Field             | Required | Type                         |
| ----------------- | -------- | ---------------------------- |
| `activeSessionId` | yes      | `string`                     |
| `action`          | yes      | `AgentHeartbeatUpdateAction` |
