# agents and children API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## list_agent_peers

| Field | Required | Type |
| --- | --- | --- |
| `workerToken` | yes | `string` |

## send_message

| Field | Required | Type |
| --- | --- | --- |
| `targetActiveSessionId` | yes | `string` |
| `message` | yes | `string` |
| `fromActiveSessionId` | no | `string` |
| `agentOrigin` | no | `boolean` |
| `deliveryMode` | no | `AgentSessionMessageDeliveryMode` |

## agent_messages_status

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | no | `string` |

## agent_messages_pause

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | no | `string` |

## agent_messages_resume

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | no | `string` |

## agent_messages_clear

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## start_side_question

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `sideQuestionId` | yes | `string` |
| `question` | yes | `string` |
| `previousTurns` | no | `AgentConnectionSideQuestionTurn[]` |

## abort_side_question

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `sideQuestionId` | yes | `string` |

## cancel_rlm_child

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `childId` | yes | `string` |

## delete_rlm_subagent

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `childId` | yes | `string` |

## get_rlm_children

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## get_user_messages_for_forking

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
