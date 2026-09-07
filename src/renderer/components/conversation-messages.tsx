import { MessageMarkdown } from "./message-markdown"
import { AnnotatableResponse } from "./annotatable-response"
import type { ResponseAnnotation } from "../response-annotation"
import { memo } from "react"
import type { ReactNode } from "react"
import { styles } from "./conversation-transcript.styles"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionMessage } from "../../packages/prime-agent"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./ui/message-scroller"

export type ConversationMessagesProps = Readonly<{
  sessionId?: string
  agentName?: string
  activity?: ReactNode
  onAnnotate?: (annotation: ResponseAnnotation) => void
  messages: readonly PrimeSessionMessage[]
}>
const MessageRowContent = ({
  message,
  agentName,
  onAnnotate,
}: Readonly<{
  message: PrimeSessionMessage
  onAnnotate?: (annotation: ResponseAnnotation) => void
  agentName?: string
}>) => {
  let label = "System message"
  if (message.role === "assistant") {
    label = `${agentName ?? "Prime Agent"} message`
  } else if (message.role === "user") {
    label = "Your message"
  }
  const paragraphOccurrences = new Map<string, number>()
  const content = (
    <div
      {...stylex.props(
        styles.messageParagraph,
        styles.messageEntryContent,
        message.role === "user" && styles.userMessageContent,
        message.role === "system" && styles.systemMessageContent,
      )}
    >
      {message.role === "assistant" ? (
        <MessageMarkdown content={message.content} />
      ) : (
        message.content.split(/\n{2,}/u).map((paragraph) => {
          const occurrence = paragraphOccurrences.get(paragraph) ?? 0
          paragraphOccurrences.set(paragraph, occurrence + 1)
          return (
            <p
              key={JSON.stringify([paragraph, occurrence])}
              {...stylex.props(styles.messageParagraph)}
            >
              {paragraph}
            </p>
          )
        })
      )}
    </div>
  )
  return (
    <MessageScrollerItem>
      <article
        aria-label={label}
        {...stylex.props(styles.messageEntry, message.role === "user" && styles.messageEntryUser)}
      >
        {message.role === "system" ? (
          <header {...stylex.props(styles.messageEntryHeader)}>
            <span {...stylex.props(styles.messageEntryRole)}>System</span>
          </header>
        ) : null}
        {message.role === "assistant" && onAnnotate ? (
          <AnnotatableResponse
            messageId={message.id}
            agentName={agentName ?? "Prime Agent"}
            onAdd={onAnnotate}
          >
            {content}
          </AnnotatableResponse>
        ) : (
          content
        )}
      </article>
    </MessageScrollerItem>
  )
}
// Accepted snapshots retain unchanged message identities through the query cache.
const MessageRow = memo(MessageRowContent)
MessageRow.displayName = "MessageRow"

const Transcript = ({ messages, activity, agentName, onAnnotate }: ConversationMessagesProps) => (
  <MessageScroller xstyle={[styles.conversationTranscriptShell]}>
    <MessageScrollerViewport
      aria-label="Conversation transcript"
      aria-live="polite"
      role="log"
      xstyle={[styles.conversationTranscript]}
    >
      <MessageScrollerContent xstyle={[styles.conversationTranscriptInner]}>
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            agentName={agentName}
            onAnnotate={onAnnotate}
          />
        ))}
        {activity}
      </MessageScrollerContent>
    </MessageScrollerViewport>
    <MessageScrollerButton />
  </MessageScroller>
)

const ConversationMessagesComponent = (props: ConversationMessagesProps) => (
  <MessageScrollerProvider restorationKey={props.sessionId}>
    <Transcript {...props} />
  </MessageScrollerProvider>
)

/** Reuses the transcript while draft edits leave its snapshot and annotation callback unchanged. */
export const ConversationMessages = memo(ConversationMessagesComponent)
