import { memo } from "react"
import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { ConversationActivity } from "./conversation-activity"
import { ConversationMessages } from "./conversation-messages"
import type { ConversationMessagesProps } from "./conversation-messages"

const ConversationTranscriptComponent = ({
  snapshot,
  ...props
}: Omit<ConversationMessagesProps, "activity"> & { snapshot?: PrimeSessionSnapshot }) => (
  <ConversationMessages
    {...props}
    activity={snapshot ? <ConversationActivity snapshot={snapshot} /> : undefined}
  />
)

/** Session activity composes with the shared readable message surface. */
export const ConversationTranscript = memo(ConversationTranscriptComponent)
