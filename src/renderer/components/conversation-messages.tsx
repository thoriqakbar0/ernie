import { UiAnnotationHost } from "./ui-annotation-host"
import { SubagentAvatar } from "./subagent-avatar"
import { MessageMarkdown } from "./message-markdown"
import { AnnotatableResponse } from "./annotatable-response"
import type { ResponseAnnotation } from "../response-annotation"
import { Fragment, memo } from "react"
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
  participantId?: string
  sessionId?: string
  agentName?: string
  activity?: ReactNode
  beforeMessages?: ReadonlyMap<string, ReactNode>
  onAnnotate?: (annotation: ResponseAnnotation) => void
  messages: readonly PrimeSessionMessage[]
}>
const MessageRowContent = ({
  message,
  regionId,
  participantId,
  agentName,
  onAnnotate,
}: Readonly<{
  message: PrimeSessionMessage
  regionId: string
  participantId?: string
  onAnnotate?: (annotation: ResponseAnnotation) => void
  agentName?: string
}>) => {
  let label = "System message"
  if (message.role === "assistant") {
    label = `${agentName ?? "Prime Agent"} message`
  } else if (message.role === "user") {
    label = participantId ? "Task message" : "Your message"
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
        data-ui-annotation-region={regionId}
        {...stylex.props(styles.messageEntry, message.role === "user" && styles.messageEntryUser)}
      >
        {participantId && message.role === "assistant" ? (
          <header {...stylex.props(styles.participantHeader)}>
            <SubagentAvatar childId={participantId} />
            <span>{agentName ?? "Subagent"}</span>
          </header>
        ) : null}
        {participantId && message.role === "user" ? (
          <header {...stylex.props(styles.messageEntryHeader, styles.messageEntryRole)}>
            Task message
          </header>
        ) : null}
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
        <UiAnnotationHost id={regionId} page="conversation" />
      </article>
    </MessageScrollerItem>
  )
}
// Accepted snapshots retain unchanged message identities through the query cache.
const MessageRow = memo(MessageRowContent)
MessageRow.displayName = "MessageRow"

const Transcript = ({
  sessionId,
  messages,
  activity,
  beforeMessages,
  agentName,
  participantId,
  onAnnotate,
}: ConversationMessagesProps) => (
  <MessageScroller xstyle={[styles.conversationTranscriptShell]}>
    <MessageScrollerViewport
      aria-label="Conversation transcript"
      aria-live="polite"
      role="log"
      xstyle={[styles.conversationTranscript]}
    >
      <MessageScrollerContent xstyle={[styles.conversationTranscriptInner]}>
        {messages.map((message) => (
          <Fragment key={message.id}>
            {beforeMessages?.get(message.id)}
            <MessageRow
              key={message.id}
              message={message}
              regionId={`message:${sessionId ?? "root"}:${participantId ?? "parent"}:${message.id}`}
              participantId={participantId}
              agentName={agentName}
              onAnnotate={onAnnotate}
            />
          </Fragment>
        ))}
        {activity}
        <UiAnnotationHost
          id={`transcript:${sessionId ?? "root"}:${participantId ?? "parent"}`}
          page="conversation"
          fallback={2}
        />
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
