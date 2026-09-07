# configuration API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## get_direct_worker_transport

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_model_catalog

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_available_models

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## set_model

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `provider`        | yes      | `string` |
| `modelId`         | yes      | `string` |

## cycle_model

| Field             | Required | Type                      |
| ----------------- | -------- | ------------------------- |
| `activeSessionId` | yes      | `string`                  |
| `direction`       | no       | `"forward" \| "backward"` |

## set_scoped_models

| Field             | Required | Type                           |
| ----------------- | -------- | ------------------------------ |
| `activeSessionId` | yes      | `string`                       |
| `scopedModels`    | yes      | `AgentConnectionScopedModel[]` |

## set_thinking_level

| Field             | Required | Type            |
| ----------------- | -------- | --------------- |
| `activeSessionId` | yes      | `string`        |
| `level`           | yes      | `ThinkingLevel` |

## set_service_tier

| Field             | Required | Type          |
| ----------------- | -------- | ------------- |
| `activeSessionId` | yes      | `string`      |
| `serviceTier`     | yes      | `ServiceTier` |

## cycle_thinking_level

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## set_transport

| Field             | Required | Type        |
| ----------------- | -------- | ----------- |
| `activeSessionId` | yes      | `string`    |
| `transport`       | yes      | `Transport` |

## set_auto_compaction

| Field             | Required | Type      |
| ----------------- | -------- | --------- |
| `activeSessionId` | yes      | `string`  |
| `enabled`         | yes      | `boolean` |

## set_auto_retry

| Field             | Required | Type      |
| ----------------- | -------- | --------- |
| `activeSessionId` | yes      | `string`  |
| `enabled`         | yes      | `boolean` |

## compact

| Field                | Required | Type     |
| -------------------- | -------- | -------- |
| `activeSessionId`    | yes      | `string` |
| `customInstructions` | no       | `string` |

## refine

| Field             | Required | Type      |
| ----------------- | -------- | --------- |
| `activeSessionId` | yes      | `string`  |
| `instructions`    | no       | `string`  |
| `rollbackId`      | no       | `string`  |
| `global`          | no       | `boolean` |

## abort_compaction

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## abort_retry

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_rlm_max_depth_status

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## set_rlm_max_depth

| Field             | Required | Type      |
| ----------------- | -------- | --------- |
| `activeSessionId` | yes      | `string`  |
| `maxDepth`        | yes      | `number`  |
| `global`          | no       | `boolean` |

## retry_worker

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
