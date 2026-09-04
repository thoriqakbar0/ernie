import type { PrimeSessionMessage } from "../../packages/prime-agent"
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
  messages: readonly PrimeSessionMessage[]
}>

export function ConversationTranscript({ messages }: ConversationTranscriptProps) {
  return (
    <MessageScrollerProvider>
      <Transcript messages={messages} />
    </MessageScrollerProvider>
  )
}

function Transcript({ messages }: ConversationTranscriptProps) {
  const { atEnd } = useMessageScroller()

  return (
    <MessageScroller className="conversation-transcript-shell">
      <MessageScrollerViewport
        aria-label="Conversation transcript"
        aria-live="polite"
        className="conversation-transcript"
        role="log"
      >
        <MessageScrollerContent className="conversation-transcript__inner">
          {messages.map((message) => (
            <MessageScrollerItem key={message.id}>
              <article className={`message-entry message-entry--${message.role}`}>
                <header className="message-entry__header">
                  <span className="message-entry__role">
                    {message.role === "assistant" ? "Prime Agent" : message.role === "user" ? "You" : "System"}
                  </span>
                </header>
                <p className="message-entry__content">{message.content}</p>
              </article>
            </MessageScrollerItem>
          ))}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      {!atEnd ? <div aria-hidden="true" className="conversation-scroll-shimmer" /> : null}
      <MessageScrollerButton />
    </MessageScroller>
  )
}
