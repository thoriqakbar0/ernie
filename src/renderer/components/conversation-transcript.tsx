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
  useMessageScroller,
} from "./ui/message-scroller"
type ConversationTranscriptProps = Readonly<{
  sessionId?: string
  agentName?: string
  snapshot?: PrimeSessionSnapshot
  messages: readonly PrimeSessionMessage[]
}>
export function ConversationTranscript(props: ConversationTranscriptProps) {
  return (
    <MessageScrollerProvider restorationKey={props.sessionId}>
      <Transcript {...props} />
    </MessageScrollerProvider>
  )
}
function Transcript({ messages, snapshot, agentName }: ConversationTranscriptProps) {
  const { atEnd } = useMessageScroller()
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
            <MessageScrollerItem key={message.id}>
              <article
                aria-label={message.role === "assistant" ? `${agentName ?? "Prime Agent"} message` : message.role === "user" ? "Your message" : "System message"}
                {...stylex.props(
                  styles.messageEntry,
                  message.role === "user" && styles.messageEntryUser,
                )}
              >
                {message.role === "system" ? <header {...stylex.props(styles.messageEntryHeader)}>
                  <span {...stylex.props(styles.messageEntryRole)}>System</span>
                </header> : null}
                <p
                  {...stylex.props(
                    styles.messageParagraph,
                    styles.messageEntryContent,
                    message.role === "user" && styles.userMessageContent,
                    message.role === "system" && styles.systemMessageContent,
                  )}
                >
                  {message.content}
                </p>
              </article>
            </MessageScrollerItem>
          ))}
          {snapshot ? <ConversationActivity snapshot={snapshot}/> : null}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      {!atEnd ? (
        <div aria-hidden="true" {...stylex.props(styles.conversationScrollShimmer)} />
      ) : null}
      <MessageScrollerButton />
    </MessageScroller>
  )
}
