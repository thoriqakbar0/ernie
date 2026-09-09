# Responses and events

The raw request result is a discriminated success/failure envelope. Success data is deliberately `unknown`; validate the command-specific payload before using it.

```typescript
export type DaemonResponse =
  | {
      id?: string
      type: "response"
      command: string
      success: true
      data?: unknown
    }
  | {
      id?: string
      type: "response"
      command: string
      success: false
      error: string
      errorInfo?: DaemonErrorInfo
    }
```

## Structured failures

```typescript
export type DaemonErrorInfo =
  | {
      code: "missing_session_cwd"
      issue: SessionCwdIssue
    }
  | {
      code: "session_import_file_not_found"
      filePath: string
    }
  | {
      code: "session_already_active"
      sessionPath: string
      activeSessionId?: string
    }
  | {
      code: "command_result_uncertain"
      clientId: DaemonClientId
      commandId: DaemonCommandId
    }
```

An uncertain mutation result does not authorize replay. Preserve command identity and inspect the configured recovery path. A closed connection is separate from a negative command response.

## Outbound records

The following fields come from `DaemonOutbound`. Records can carry native event payloads or snapshot fragments; these are separate from Ernie generation/revision envelopes. Optional wire IDs are omitted from these tables.

### response

| Field     | Required | Type      |
| --------- | -------- | --------- |
| `command` | yes      | `string`  |
| `success` | yes      | `true`    |
| `data`    | no       | `unknown` |

### response

| Field       | Required | Type              |
| ----------- | -------- | ----------------- |
| `command`   | yes      | `string`          |
| `success`   | yes      | `false`           |
| `error`     | yes      | `string`          |
| `errorInfo` | no       | `DaemonErrorInfo` |

### session_list_progress

| Field             | Required | Type                    |
| ----------------- | -------- | ----------------------- |
| `command`         | yes      | `"list_saved_sessions"` |
| `activeSessionId` | no       | `string`                |
| `loaded`          | yes      | `number`                |
| `total`           | yes      | `number`                |

### session_list_item

| Field             | Required | Type                     |
| ----------------- | -------- | ------------------------ |
| `command`         | yes      | `"list_saved_sessions"`  |
| `activeSessionId` | no       | `string`                 |
| `session`         | yes      | `DaemonSavedSessionInfo` |

### daemon_hello

| Field                      | Required | Type                                |
| -------------------------- | -------- | ----------------------------------- |
| `socketPath`               | yes      | `string`                            |
| `protocol`                 | yes      | `DaemonProtocolInfo`                |
| `schemaId`                 | no       | `string`                            |
| `schemaRevision`           | no       | `number`                            |
| `appVersion`               | no       | `string`                            |
| `runtime`                  | no       | `DaemonRuntimeIdentity`             |
| `supervisorGeneration`     | no       | `string`                            |
| `supervisorPid`            | no       | `number`                            |
| `supervisorOwnerToken`     | no       | `string`                            |
| `supervisorProcessStartId` | no       | `string`                            |
| `supervisorSocketPath`     | no       | `string`                            |
| `clientId`                 | yes      | `string`                            |
| `serverCapabilities`       | yes      | `readonly DaemonServerCapability[]` |

### daemon_closing

| Field    | Required | Type                  |
| -------- | -------- | --------------------- |
| `reason` | yes      | `DaemonClosingReason` |

### heartbeats_changed

| Field | Required | Type |
| ----- | -------- | ---- |

### roster_update

| Field     | Required | Type                 |
| --------- | -------- | -------------------- |
| `changed` | yes      | `AgentRosterEntry[]` |
| `removed` | no       | `string[]`           |
| `resync`  | no       | `true`               |

### session_event

| Field             | Required | Type              |
| ----------------- | -------- | ----------------- |
| `activeSessionId` | yes      | `string`          |
| `event`           | yes      | `any`             |
| `meta`            | no       | `DaemonEventMeta` |

### side_question_event

| Field             | Required | Type                               |
| ----------------- | -------- | ---------------------------------- |
| `activeSessionId` | yes      | `string`                           |
| `event`           | yes      | `AgentConnectionSideQuestionEvent` |

### session_status

| Field             | Required | Type              |
| ----------------- | -------- | ----------------- |
| `activeSessionId` | yes      | `string`          |
| `recap`           | no       | `string`          |
| `meta`            | no       | `DaemonEventMeta` |

### session_replaced

| Field             | Required | Type                   |
| ----------------- | -------- | ---------------------- |
| `activeSessionId` | yes      | `string`               |
| `state`           | yes      | `AgentConnectionState` |
| `messages`        | yes      | `AgentMessage[]`       |
| `snapshotFollows` | no       | `boolean`              |
| `meta`            | no       | `DaemonEventMeta`      |

### session_resynced

| Field             | Required | Type                    |
| ----------------- | -------- | ----------------------- |
| `activeSessionId` | yes      | `string`                |
| `snapshot`        | yes      | `DaemonSessionSnapshot` |
| `meta`            | no       | `DaemonEventMeta`       |

### session_attached

| Field               | Required | Type                    |
| ------------------- | -------- | ----------------------- |
| `activeSessionId`   | yes      | `string`                |
| `state`             | yes      | `SessionSummary`        |
| `messages`          | yes      | `AgentMessage[]`        |
| `snapshot`          | no       | `DaemonSessionSnapshot` |
| `replay`            | no       | `DaemonReplayInfo`      |
| `lastEventSequence` | no       | `number`                |

### session_snapshot_begin

| Field              | Required | Type                                      |
| ------------------ | -------- | ----------------------------------------- |
| `activeSessionId`  | yes      | `string`                                  |
| `snapshotId`       | yes      | `string`                                  |
| `snapshot`         | yes      | `Omit<DaemonSessionSnapshot, "messages">` |
| `messageCount`     | yes      | `number`                                  |
| `targetChunkBytes` | yes      | `number`                                  |
| `purpose`          | no       | `"attach" \| "replacement" \| "resync"`   |

### session_snapshot_chunk

| Field             | Required | Type             |
| ----------------- | -------- | ---------------- |
| `activeSessionId` | yes      | `string`         |
| `snapshotId`      | yes      | `string`         |
| `index`           | yes      | `number`         |
| `messages`        | yes      | `AgentMessage[]` |

### session_snapshot_end

| Field               | Required | Type                |
| ------------------- | -------- | ------------------- |
| `activeSessionId`   | yes      | `string`            |
| `snapshotId`        | yes      | `string`            |
| `chunkCount`        | yes      | `number`            |
| `lastEventSequence` | yes      | `number`            |
| `lastEventCursor`   | no       | `DaemonEventCursor` |

### session_snapshot_failed

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `snapshotId`      | yes      | `string` |
| `error`           | yes      | `string` |

### session_detached

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

### session_closed

| Field             | Required | Type                        |
| ----------------- | -------- | --------------------------- |
| `activeSessionId` | yes      | `string`                    |
| `reason`          | yes      | `DaemonSessionClosedReason` |
| `meta`            | no       | `DaemonEventMeta`           |

### extension_ui_request

| Field             | Required | Type                      |
| ----------------- | -------- | ------------------------- |
| `activeSessionId` | yes      | `string`                  |
| `method`          | yes      | `string`                  |
| `payload`         | yes      | `Record<string, unknown>` |
| `meta`            | no       | `DaemonEventMeta`         |

### extension_error

| Field             | Required | Type              |
| ----------------- | -------- | ----------------- |
| `activeSessionId` | yes      | `string`          |
| `extensionPath`   | yes      | `string`          |
| `event`           | yes      | `string`          |
| `error`           | yes      | `string`          |
| `meta`            | no       | `DaemonEventMeta` |
