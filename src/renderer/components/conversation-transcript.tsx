import { MessageMarkdown } from "./message-markdown"
import { AnnotatableResponse } from "./annotatable-response"
import type { ResponseAnnotation } from "../response-annotation"
import { memo } from "react"
import { styles } from "./conversation-transcript.styles"
import * as stylex from "@stylexjs/stylex"
import type { PrimeSessionMessage, PrimeSessionSnapshot } from "../../packages/prime-agent"
import { ConversationActivity } from "./conversation-activity"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./ui/message-scroller"
type ConversationTranscriptProps = Readonly<{
  sessionId?: string
  agentName?: string
  snapshot?: PrimeSessionSnapshot
  onAnnotate?: (annotation: ResponseAnnotation) => void
  messages: readonly PrimeSessionMessage[]
}>
export function ConversationTranscript(props: ConversationTranscriptProps) {
  return (
    <MessageScrollerProvider restorationKey={props.sessionId}>
      <Transcript {...props} />
    </MessageScrollerProvider>
  )
}
function Transcript({ messages, snapshot, agentName, onAnnotate }: ConversationTranscriptProps) {
  return (
    <MessageScroller xstyle={[styles.conversationTranscriptShell]}>
      <MessageScrollerViewport
        aria-label="Conversation transcript"
        aria-live="polite"
        role="log"
        xstyle={[styles.conversationTranscript]}
      >
        <MessageScrollerContent xstyle={[styles.conversationTranscriptInner]}>
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} agentName={agentName} onAnnotate={onAnnotate} />
          ))}
          {snapshot ? <ConversationActivity snapshot={snapshot}/> : null}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  )
}

// Accepted snapshots retain unchanged message identities through the query cache.
const MessageRow = memo(function MessageRow({ message, agentName, onAnnotate }: Readonly<{
  message: PrimeSessionMessage
  onAnnotate?: (annotation: ResponseAnnotation) => void
  agentName?: string
}>) {
  const content = <div {...stylex.props(styles.messageParagraph, styles.messageEntryContent,
    message.role === "user" && styles.userMessageContent,
    message.role === "system" && styles.systemMessageContent)}>
    {message.role === "assistant" ? <MessageMarkdown content={message.content}/> : message.content.split(/\n{2,}/).map((paragraph, index) => <p key={index} {...stylex.props(styles.messageParagraph)}>{paragraph}</p>)}
  </div>
  return <MessageScrollerItem>
    <article aria-label={message.role === "assistant" ? `${agentName ?? "Prime Agent"} message` : message.role === "user" ? "Your message" : "System message"}
      {...stylex.props(styles.messageEntry, message.role === "user" && styles.messageEntryUser)}>
      {message.role === "system" ? <header {...stylex.props(styles.messageEntryHeader)}>
        <span {...stylex.props(styles.messageEntryRole)}>System</span>
      </header> : null}
      {message.role === "assistant" && onAnnotate
        ? <AnnotatableResponse messageId={message.id} agentName={agentName ?? "Prime Agent"} onAdd={onAnnotate}>{content}</AnnotatableResponse>
        : content}
    </article>
  </MessageScrollerItem>
})
