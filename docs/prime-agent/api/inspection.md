# inspection API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## list

| Field                | Required | Type      |
| -------------------- | -------- | --------- |
| `all`                | no       | `boolean` |
| `cwd`                | no       | `string`  |
| `sessionDir`         | no       | `string`  |
| `includeClientOwned` | no       | `boolean` |

## list_saved_sessions

| Field             | Required | Type                               |
| ----------------- | -------- | ---------------------------------- |
| `activeSessionId` | yes      | `string`                           |
| `scope`           | yes      | `AgentConnectionSavedSessionScope` |

## list_saved_sessions

| Field        | Required | Type                               |
| ------------ | -------- | ---------------------------------- |
| `cwd`        | yes      | `string`                           |
| `sessionDir` | no       | `string`                           |
| `scope`      | yes      | `AgentConnectionSavedSessionScope` |

## roster_subscribe

| Field | Required | Type |
| ----- | -------- | ---- |

## roster_unsubscribe

| Field | Required | Type |
| ----- | -------- | ---- |

## get_session_header

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_state

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_connection_state

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_messages

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_session_stats

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_context_tree

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_commands

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_resource_snapshot

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_session_context

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_session_tree

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_last_assistant_text

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |

## get_tool_definition

| Field             | Required | Type     |
| ----------------- | -------- | -------- |
| `activeSessionId` | yes      | `string` |
| `name`            | yes      | `string` |
