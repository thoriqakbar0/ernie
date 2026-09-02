import { useState } from "react"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessions,
  useWorkspacePath,
} from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

export function Sidebar() {
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const workspacePath = useWorkspacePath()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const [conversationsExpanded, setConversationsExpanded] = useState(true)

  return (
    <aside aria-label="Sidebar" className="session-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__identity">
          <ErnieMark className="sidebar-brand__mark" />
          <div>
            <p className="sidebar-brand__name">Ernie</p>
            <p className="sidebar-brand__tagline">Local agent desk</p>
          </div>
        </div>
        <button
          aria-label="New conversation"
          className="new-session-button"
          disabled={createSession.isPending}
          onClick={() => createSession.mutate()}
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      <nav aria-label="Conversations" className="sidebar-nav">
        <div aria-atomic="true" aria-live="polite" className="session-creation-feedback">
          {createSession.isPending ? <p role="status">Creating conversation…</p> : null}
          {createSession.isError ? (
            <p role="alert">
              <span>{getErrorMessage(createSession.error)}</span>. Select New conversation to try again.
            </p>
          ) : null}
        </div>
        <button
          aria-controls="today-conversations"
          aria-expanded={conversationsExpanded}
          aria-label="Conversations"
          className="sidebar-nav__heading"
          onClick={() => setConversationsExpanded((expanded) => !expanded)}
          type="button"
        >
          <span>Sessions</span>
          <span className="sidebar-nav__count">{sessions.data?.length ?? 0}</span>
          <ChevronIcon expanded={conversationsExpanded} />
        </button>
        {conversationsExpanded ? (
          <ul className="sidebar-session-list" id="today-conversations">
            {sessions.isPending ? (
              <li className="sidebar-placeholder" role="status">Loading sessions…</li>
            ) : sessions.isError ? (
              <li className="sidebar-placeholder sidebar-placeholder--error" role="alert">Unable to load sessions</li>
            ) : sessions.data.length === 0 ? (
              <li className="sidebar-placeholder">No sessions yet</li>
            ) : sessions.data.map((session) => (
              <li key={session.id}>
                <button
                  aria-current={session.id === selectedSessionId ? "page" : undefined}
                  aria-label={session.name ?? session.cwd}
                  className="session-button"
                  onClick={() => selectSession(session.id)}
                  title={session.name ?? session.cwd}
                  type="button"
                >
                  <span className="session-button__topline">
                    <span className="session-button__name">{session.name ?? getWorkspaceName(session.cwd)}</span>
                  </span>
                  <span className="session-button__path">{getWorkspaceName(session.cwd)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-footer__label">Workspace</span>
        <span className="sidebar-footer__path" title={workspacePath.data}>{workspacePath.data ?? "Loading…"}</span>
      </div>
    </aside>
  )
}

function ChevronIcon({ expanded }: Readonly<{ expanded: boolean }>) {
  return (
    <svg aria-hidden="true" className={expanded ? "chevron chevron--expanded" : "chevron"} fill="none" viewBox="0 0 12 12">
      <path d="m4.5 2.5 3.5 3.5-3.5 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}
