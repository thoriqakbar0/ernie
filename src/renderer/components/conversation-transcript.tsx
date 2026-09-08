import { memo, useMemo } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { ConversationMessages } from "./conversation-messages"
import type { ConversationMessagesProps } from "./conversation-messages"
import { conversationTurns } from "../conversation-turns"
import { TurnExecutions } from "./turn-executions"

const ConversationTranscriptComponent = ({
  snapshot,
  ...props
}: Omit<ConversationMessagesProps, "activity" | "beforeMessages"> & {
  snapshot?: PrimeSessionSnapshot
}) => {
  const turns = useMemo(() => (snapshot ? conversationTurns(snapshot) : []), [snapshot])
  const readableIds = new Set(props.messages.map((message) => message.id))
  const beforeMessages = new Map(
    turns
      .filter((turn) => turn.beforeId && readableIds.has(turn.beforeId))
      .map((turn) => [turn.beforeId ?? "", <TurnExecutions key={turn.id} turn={turn} />]),
  )
  return (
    <ConversationMessages
      {...props}
      beforeMessages={beforeMessages}
      activity={
        <>
          {turns
            .filter((turn) => !turn.beforeId || !readableIds.has(turn.beforeId))
            .map((turn) => (
              <TurnExecutions key={turn.id} turn={turn} />
            ))}
        </>
      }
    />
  )
}

/** Composes messages with their per-turn execution details. */
export const ConversationTranscript = memo(ConversationTranscriptComponent)
