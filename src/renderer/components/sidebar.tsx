import { useMemo, useState } from "react"
import { useViewArgs } from "@zenbujs/core/react"
import { FolderIcon, MessageCircleIcon, PanelLeftCloseIcon, SearchIcon, XIcon } from "lucide-react"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import { useCreatePrimeSession, usePrimeSessionSelection, usePrimeSessionState } from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

/** Navigate real Prime Agent conversations without implying additional Agent identities. */
export function Sidebar() {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  const sessions = usePrimeSessionState()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const [query, setQuery] = useState("")
  const [activeOnly, setActiveOnly] = useState(false)
  const visible = useMemo(() => sessions.data.filter((session) => session.lifecycle !== "archived"), [sessions.data])
  const working = visible.filter((session) => session.state === "working").length
  const recovering = visible.filter((session) => session.state === "recovering").length
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return visible.filter((session) =>
      (!activeOnly || session.state !== "idle") &&
      (!search || [session.name ?? "", session.cwd].some((value) => value.toLocaleLowerCase().includes(search))),
    ).toSorted((left, right) => priority(left.state) - priority(right.state))
  }, [visible, query, activeOnly])
  const selected = visible.find((session) => session.id === selectedSessionId)

  return (
    <aside aria-label="Sidebar" className="session-sidebar agent-sidebar" id="ernie-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__identity">
          <ErnieMark className="sidebar-brand__mark" />
          <p className="sidebar-brand__name">Ernie</p>
        </div>
        <div className="sidebar-brand__actions">
        <button aria-controls="ernie-sidebar" aria-expanded="true" aria-label="Close sidebar" className="sidebar-close-button" onClick={onClose} type="button">
          <PanelLeftCloseIcon />
        </button>
        <button className="new-session-button" aria-label="New conversation" title="New conversation" disabled={createSession.isPending || !sessions.isSuccess} onClick={() => { setQuery(""); setActiveOnly(false); createSession.mutate() }} type="button">
          <PlusIcon />
        </button>
        </div>
      </div>

      <div className="session-creation-feedback">
        {createSession.isPending ? <p role="status">Creating your conversation…</p> : null}
        {createSession.isError ? <p role="alert">{createSession.error instanceof Error ? createSession.error.message : "Could not create conversation"}. Try New conversation again.</p> : null}
      </div>

        <nav aria-label="Conversations" className="sidebar-nav" id="agent-conversations">
          <div className="agent-sidebar__tools">
            <label className="sidebar-search">
              <SearchIcon aria-hidden="true" />
              <input aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={(event) => setQuery(event.target.value)} type="search" />
              {query ? <button aria-label="Clear search" onClick={() => setQuery("")} type="button"><XIcon /></button> : null}
            </label>
            <div className="sidebar-filters" aria-label="Conversation filters">
              <button aria-pressed={!activeOnly} onClick={() => setActiveOnly(false)} type="button">All <span>{visible.length}</span></button>
              <button aria-pressed={activeOnly} onClick={() => setActiveOnly(true)} type="button">Active <span>{working + recovering}</span></button>
            </div>
          </div>
          {sessions.isPending ? (
            <div className="sidebar-empty" role="status"><span className="sidebar-loading-lines" aria-hidden="true" /><strong>Connecting to Prime Agent</strong><p>Your conversations will appear here.</p></div>
          ) : sessions.isError ? (
            <div className="sidebar-empty sidebar-empty--error" role="alert"><strong>Conversations unavailable</strong><p>Check the Prime Agent connection. Your saved work remains unchanged.</p></div>
          ) : filtered.length === 0 ? (
            <div className="sidebar-empty" role="status"><MessageCircleIcon aria-hidden="true" /><strong>{query ? "No matching conversations" : activeOnly ? "Nothing running" : "A place to begin"}</strong><p>{query ? "Try a conversation name or workspace." : activeOnly ? "Active conversations appear here while work runs or recovers." : "Start a conversation with Prime Agent. Return to it whenever you need."}</p>
              {query || activeOnly ? <button type="button" onClick={() => { setQuery(""); setActiveOnly(false) }}>Show all conversations</button> : null}
            </div>
          ) : (
            <ul className="sidebar-session-list">
              {filtered.map((session) => (
                <li key={session.id}>
                  <button aria-current={session.id === selectedSessionId ? "page" : undefined} aria-label={session.name ?? session.cwd} className="session-button" data-session-id={session.id} data-session-state={session.state} onClick={() => selectSession(session.id)} title={`${session.name ?? "Untitled conversation"}\n${session.cwd}`} type="button">
                    <span className="session-button__heading"><span className="session-button__name">{session.name?.trim() || getWorkspaceName(session.cwd)}</span><span className="session-button__state">{session.lifecycle === "draft" && session.state === "idle" ? "Draft" : session.state === "working" ? "Working" : session.state === "recovering" ? "Recovering" : ""}</span></span>
                    <span className="session-button__context"><FolderIcon aria-hidden="true" /><span>{getWorkspaceName(session.cwd)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

      <div className="agent-sidebar__footer">
        <FolderIcon aria-hidden="true" />
        <span><strong>{selected ? getWorkspaceName(selected.cwd) : "Local workspace"}</strong><span title={selected?.cwd}>{selected?.cwd ?? "Choose a conversation to see its workspace"}</span></span>
      </div>
    </aside>
  )
}

function priority(state: PrimeSessionSummary["state"]) {
  switch (state) {
    case "working": return 0
    case "recovering": return 1
    case "idle": return 2
  }
}
