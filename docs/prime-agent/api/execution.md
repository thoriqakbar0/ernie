# execution API

Request field reference for Prime Agent 0.9.3. Required means required by the installed TypeScript contract. Named types remain upstream types; resolve them in the installed package before constructing nested payloads.

Every command has the literal `type` shown in its heading and an optional wire `id`. `DaemonClient.request` accepts `DaemonCommandBody` and manages request identity. Response `data` is unknown and must be parsed for the chosen command; see [responses](responses-events.md). This category includes native operations that Ernie does not expose.

## prompt

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `message` | yes | `string` |
| `content` | no | `any[]` |
| `images` | no | `ImageContent[]` |
| `streamingBehavior` | no | `"steer" \| "followUp"` |
| `queueIfBusy` | no | `boolean` |
| `expandPromptTemplates` | no | `boolean` |
| `source` | no | `InputSource` |
| `agentMessageId` | no | `string` |
| `customMessage` | no | `CustomMessage<unknown>` |
| `admissionId` | no | `string` |

## cancel_prompt_admission

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `admissionId` | yes | `string` |
| `cancelOwned` | no | `boolean` |

## prompt_and_wait

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `message` | yes | `string` |
| `content` | no | `any[]` |
| `images` | no | `ImageContent[]` |
| `streamingBehavior` | no | `"steer" \| "followUp"` |
| `queueIfBusy` | no | `boolean` |
| `expandPromptTemplates` | no | `boolean` |
| `source` | no | `InputSource` |
| `admissionId` | no | `string` |

## steer

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `message` | yes | `string` |
| `content` | no | `any[]` |
| `images` | no | `ImageContent[]` |
| `queueKey` | no | `string` |
| `expandPromptTemplates` | no | `boolean` |
| `agentMessageId` | no | `string` |
| `customMessage` | no | `CustomMessage<unknown>` |
| `prefixMessages` | no | `CustomMessage<unknown>[]` |

## follow_up

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `message` | yes | `string` |
| `content` | no | `any[]` |
| `images` | no | `ImageContent[]` |
| `queueKey` | no | `string` |
| `expandPromptTemplates` | no | `boolean` |
| `agentMessageId` | no | `string` |
| `customMessage` | no | `CustomMessage<unknown>` |
| `prefixMessages` | no | `CustomMessage<unknown>[]` |

## restore_next_turn

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `messages` | yes | `CustomMessage<unknown>[]` |

## restore_actions

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `snapshot` | yes | `SessionActionRecoverySnapshot` |

## append_custom_message

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `message` | yes | `Pick<CustomMessage<unknown>, "customType" \| "content" \| "display" \| "details">` |

## resume_queue

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## abort

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## wait_for_idle

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## wait_for_headless_completion

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `waitForRlmQuiescence` | no | `boolean` |

## get_queue

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## mutate_queued_message

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `lane` | yes | `QueuedMessageLane` |
| `index` | yes | `number` |
| `expectedText` | yes | `string` |
| `mutation` | yes | `QueuedMessageMutation` |

## clear_queue

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## abort_and_clear_queue

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |

## acquire_session_input_pause

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `leaseKey` | yes | `string` |

## release_session_input_pause

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `pauseId` | yes | `string` |

## set_steering_mode

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `mode` | yes | `AgentConnectionQueueMode` |

## set_follow_up_mode

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
| `mode` | yes | `AgentConnectionQueueMode` |

## get_system_prompt

| Field | Required | Type |
| --- | --- | --- |
| `activeSessionId` | yes | `string` |
