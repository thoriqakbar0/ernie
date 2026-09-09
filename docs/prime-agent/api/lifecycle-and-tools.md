# lifecycle and tools API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## create

| Field             | Required | Type                          |
| ----------------- | -------- | ----------------------------- |
| `sessionPath`     | no       | `string`                      |
| `continueRecent`  | no       | `boolean`                     |
| `noSession`       | no       | `boolean`                     |
| `name`            | no       | `string`                      |
| `config`          | no       | `AgentSessionRuntimeConfig`   |
| `runtimeMetadata` | no       | `AgentSessionRuntimeMetadata` |
| `lifecycle`       | no       | `DaemonSessionLifecycle`      |
| `env`             | no       | `Record<string, string>`      |
| `launchEnv`       | no       | `Record<string, string>`      |

## attach

| Field                 | Required | Type                                |
| --------------------- | -------- | ----------------------------------- |
| `activeSessionId`     | yes      | `string`                            |
| `supportsExtensionUi` | no       | `boolean`                           |
| `clientId`            | no       | `string`                            |
| `capabilities`        | no       | `readonly DaemonClientCapability[]` |
| `resumeCursor`        | no       | `DaemonResumeCursor`                |
| `telemetryDisabled`   | no       | `true`                              |
| `recoveryConfig`      | no       | `AgentSessionRuntimeConfig`         |
| `env`                 | no       | `Record<string, string>`            |
| `launchEnv`           | no       | `Record<string, string>`            |

## reattach

| Field                   | Required | Type                                |
| ----------------------- | -------- | ----------------------------------- |
| `activeSessionId`       | yes      | `string`                            |
| `targetActiveSessionId` | yes      | `string`                            |
| `supportsExtensionUi`   | no       | `boolean`                           |
| `clientId`              | no       | `string`                            |
| `capabilities`          | no       | `readonly DaemonClientCapability[]` |
| `resumeCursor`          | no       | `DaemonResumeCursor`                |
| `telemetryDisabled`     | no       | `true`                              |
| `recoveryConfig`        | no       | `AgentSessionRuntimeConfig`         |
| `env`                   | no       | `Record<string, string>`            |
| `launchEnv`             | no       | `Record<string, string>`            |

## detach

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | no       | `string` |

## complete_owned_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## promote_owned_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## kill

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## rename

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `name`            | yes      | `string` |

## execute_bash

| Field                | Required | Type      |
| -------------------- | -------- | --------- |
| `activeSessionId`    | yes      | `string`  |
| `command`            | yes      | `string`  |
| `excludeFromContext` | no       | `boolean` |
| `transient`          | no       | `boolean` |
| `runId`              | no       | `string`  |

## abort_bash

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## replace_acp_mcp_servers

| Field             | Required | Type                   |
| ----------------- | -------- | ---------------------- |
| `activeSessionId` | yes      | `string`               |
| `ownerId`         | yes      | `string`               |
| `servers`         | yes      | `AcpMcpServerConfig[]` |

## abort_branch_summary

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## execute_bash_and_wait

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `command`         | yes      | `string` |

## reload

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## new_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `parentSession`   | no       | `string` |

## switch_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `sessionPath`     | yes      | `string` |
| `cwdOverride`     | no       | `string` |

## fork

| Field             | Required | Type               |
| ----------------- | -------- | ------------------ |
| `activeSessionId` | yes      | `string`           |
| `entryId`         | yes      | `string`           |
| `position`        | no       | `"before" \| "at"` |

## navigate_tree

| Field                 | Required | Type      |
| --------------------- | -------- | --------- |
| `activeSessionId`     | yes      | `string`  |
| `targetId`            | yes      | `string`  |
| `summarize`           | no       | `boolean` |
| `customInstructions`  | no       | `string`  |
| `replaceInstructions` | no       | `boolean` |
| `label`               | no       | `string`  |

## import_jsonl

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `inputPath`       | yes      | `string` |
| `cwdOverride`     | no       | `string` |

## export_html

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `outputPath`      | no       | `string` |

## export_jsonl

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `outputPath`      | no       | `string` |

## set_session_name

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `name`            | yes      | `string` |
| `workerToken`     | no       | `string` |

## rename_saved_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | no       | `string` |
| `sessionPath`     | yes      | `string` |
| `name`            | yes      | `string` |

## delete_saved_session

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | no       | `string` |
| `sessionPath`     | yes      | `string` |

## set_session_entry_label

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `entryId`         | yes      | `string` |
| `label`           | no       | `string` |

## extension_ui_response

| Field             | Required | Type                        |
| ----------------- | -------- | --------------------------- |
| `activeSessionId` | yes      | `string`                    |
| `requestId`       | yes      | `string`                    |
| `response`        | yes      | `DaemonExtensionUIResponse` |

## ack_result

| Field       | Required | Type     |
| ----------- | -------- | -------- |
| `commandId` | yes      | `string` |

## prepare_update_restart

| Field | Required | Type |
| ----- | -------- | ---- |

## restart

| Field | Required | Type |
| ----- | -------- | ---- |

## shutdown

| Field   | Required | Type      |
| ------- | -------- | --------- |
| `force` | no       | `boolean` |
