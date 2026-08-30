const conversations = [
  { id: "t3-chat", title: "Build the chat workspace", active: true },
  { id: "zenbu", title: "Set up Zenbu views", active: false },
  { id: "lint", title: "Add React guardrails", active: false },
]

export function Sidebar() {
  return (
    <aside
      aria-label="Sidebar"
      className="flex h-screen w-full flex-col border-r border-zinc-200 bg-zinc-50 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
    >
      <div className="flex h-[52px] shrink-0 items-center justify-between px-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded-md bg-zinc-950 text-xs text-white dark:bg-zinc-50 dark:text-zinc-950">
            E
          </span>
          <span>Ernie</span>
        </div>
        <button
          aria-label="New conversation"
          className="grid size-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-white"
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pb-2 text-xs font-medium text-zinc-500">Today</p>
        <ul className="space-y-0.5">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                aria-current={conversation.active ? "page" : undefined}
                className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-zinc-500 ${conversation.active ? "bg-white font-medium shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700" : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"}`}
                type="button"
              >
                {conversation.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-zinc-200 p-2 dark:border-zinc-800">
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
