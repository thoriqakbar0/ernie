import { FormEvent, KeyboardEvent, useState } from "react"

type ChatMessage = {
  id: string
  role: "assistant" | "user"
  content: string
}

const initialMessages: ChatMessage[] = [
  {
    id: "assistant-1",
    role: "assistant",
    content: "I’m ready. What should we build in Ernie?",
  },
]

export function ChatWorkspace() {
  const [draft, setDraft] = useState("")
  const [messages, setMessages] = useState(initialMessages)

  const submitDraft = () => {
    const content = draft.trim()

    if (!content) return

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content },
    ])
    setDraft("")
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    submitDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      submitDraft()
    }
  }

  return (
    <section aria-label="Chat workspace" className="flex min-h-0 min-w-0 flex-col bg-white dark:bg-zinc-900">
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-zinc-200 px-5 dark:border-zinc-800">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold tracking-tight">Build the chat workspace</h1>
          <p className="truncate text-xs text-zinc-500">/Users/thor/work/ernie</p>
        </div>
        <button
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white"
          type="button"
        >
          Share
        </button>
      </header>

      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-10">
          {messages.map((message) => (
            <article className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" key={message.id}>
              <div className={`grid size-7 place-items-center rounded-md text-[11px] font-semibold ${message.role === "assistant" ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"}`}>
                {message.role === "assistant" ? "E" : "You"}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="mb-1 text-xs font-medium text-zinc-500">
                  {message.role === "assistant" ? "Ernie" : "You"}
                </p>
                <p className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-800 dark:text-zinc-200">
                  {message.content}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-2">
        <form className="mx-auto max-w-3xl" onSubmit={handleSubmit}>
          <div className="rounded-2xl border border-zinc-300 bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.06)] focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:shadow-none dark:focus-within:border-zinc-600">
            <label className="sr-only" htmlFor="chat-message">Message Ernie</label>
            <textarea
              className="min-h-20 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 outline-none placeholder:text-zinc-400"
              id="chat-message"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Ernie to build something…"
              rows={3}
              value={draft}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                <button className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white" type="button">
                  Agent
                </button>
                <button className="rounded-md px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white" type="button">
                  GPT-5
                </button>
              </div>
              <button
                aria-label="Send message"
                className="grid size-8 place-items-center rounded-lg bg-zinc-950 text-white transition hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
                disabled={!draft.trim()}
                type="submit"
              >
                <SendIcon />
              </button>
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-400">Enter to send · Shift+Enter for a new line</p>
        </form>
      </div>
    </section>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="m3 8 5-5 5 5M8 3v10" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  )
}
