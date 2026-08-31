import { useState } from "react"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessions,
} from "../prime-agent-state"

export function Sidebar() {
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const [conversationsExpanded, setConversationsExpanded] = useState(true)

  return (
    <aside
      aria-label="Sidebar"
      className="flex h-screen w-full flex-col border-r border-zinc-200/80 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
    >
      <div className="flex h-[52px] shrink-0 items-center justify-between px-3">
        <div className="flex min-w-0 items-center gap-2">
          <ErnieMark />
          <span className="truncate text-sm font-medium tracking-tight">Ernie</span>
        </div>
        <button
          aria-label="New conversation"
          className="grid size-7 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-200/80 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <button
          aria-controls="today-conversations"
          aria-expanded={conversationsExpanded}
          className="flex h-8 w-full items-center justify-between rounded-md px-2 text-xs font-medium text-zinc-500 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 dark:hover:text-zinc-300"
          onClick={() => setConversationsExpanded((expanded) => !expanded)}
          type="button"
        >
          <span>Conversations</span>
          <ChevronIcon expanded={conversationsExpanded} />
        </button>
        {conversationsExpanded ? (
          <ul className="space-y-0.5 px-0.5" id="today-conversations">
            {sessions.data?.length === 0 ? (
              <li className="flex h-8 items-center px-2 text-xs text-zinc-400 dark:text-zinc-600">
                No conversations yet
              </li>
            ) : sessions.data?.map((session) => (
              <li key={session.id}>
                <button
                  aria-current={session.id === selectedSessionId ? "page" : undefined}
                  className={`flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 ${session.id === selectedSessionId ? "bg-zinc-200/75 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-600 hover:bg-zinc-200/55 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"}`}
                  onClick={() => selectSession(session.id)}
                  type="button"
                >
                  <SessionStateDot state={session.state} />
                  <span className="min-w-0 flex-1 truncate">{session.name ?? session.cwd}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>

      <div className="border-t border-zinc-200/80 p-2 dark:border-zinc-800">
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-200/70 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
          type="button"
        >
          <SettingsIcon />
          Settings
        </button>
      </div>
    </aside>
  )
}

function ErnieMark() {
  return (
    <svg aria-label="Ernie" className="h-3.5 w-4 shrink-0" fill="none" viewBox="0 0 16 14">
      <path d="M2 2h11M2 7h8M2 12h11" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

function SessionStateDot({ state }: Readonly<{ state: "idle" | "working" | "recovering" }>) {
  const tone = state === "working"
    ? "bg-emerald-500"
    : state === "recovering"
      ? "bg-amber-500"
      : "bg-zinc-300 dark:bg-zinc-700"
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${tone}`} />
}

function ChevronIcon({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <svg
      aria-hidden="true"
      className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 12 12"
    >
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.25" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="size-4" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 1.75v1.1M8 13.15v1.1M1.75 8h1.1M13.15 8h1.1M3.58 3.58l.78.78M11.64 11.64l.78.78M12.42 3.58l-.78.78M4.36 11.64l-.78.78" stroke="currentColor" strokeLinecap="round" strokeWidth="1.25" />
    </svg>
  )
}
