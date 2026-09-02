import type { PrimeSessionMessage } from "../../packages/prime-agent"

type ConversationTranscriptProps = Readonly<{
  messages: readonly PrimeSessionMessage[]
}>

export function ConversationTranscript({ messages }: ConversationTranscriptProps) {
  return (
    <div
      aria-label="Conversation transcript"
      aria-live="polite"
      className="conversation-transcript"
      role="log"
    >
      <div className="conversation-transcript__inner">
        {messages.map((message) => (
          <article className={`message-entry message-entry--${message.role}`} key={message.id}>
            <header className="message-entry__header">
              <span className="message-entry__role">
                {message.role === "assistant" ? "Prime Agent" : message.role === "user" ? "You" : "System"}
              </span>
              <span aria-hidden="true" className="message-entry__rule" />
            </header>
            <p className="message-entry__content">{message.content}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
