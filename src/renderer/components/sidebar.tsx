import { useMemo } from "react"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessions,
} from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

export function Sidebar() {
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const visibleSessions = useMemo(
    () => [...(sessions.data ?? [])].sort(
      (left, right) => sessionStatePriority(left.state) - sessionStatePriority(right.state),
    ),
    [sessions.data],
  )

  return (
    <aside aria-label="Sidebar" className="session-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__identity">
          <ErnieMark className="sidebar-brand__mark" />
          <p className="sidebar-brand__name">Ernie</p>
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
        <div className="session-creation-feedback">
          {createSession.isPending ? <p role="status">Creating conversation…</p> : null}
          {createSession.isError ? (
            <p role="alert">
              <span>{getErrorMessage(createSession.error)}</span>. Select New conversation to try again.
            </p>
          ) : null}
        </div>
        <ul className="sidebar-session-list">
          {sessions.isPending ? (
            <li className="sidebar-placeholder" role="status">Loading sessions…</li>
          ) : sessions.isError ? (
            <li className="sidebar-placeholder sidebar-placeholder--error" role="alert">Unable to load sessions</li>
          ) : sessions.data.length === 0 ? (
            <li className="sidebar-placeholder">No sessions yet</li>
          ) : visibleSessions.map((session) => (
            <li key={session.id}>
              <button
                aria-current={session.id === selectedSessionId ? "page" : undefined}
                aria-label={session.name ?? session.cwd}
                className="session-button"
                data-session-id={session.id}
                data-session-state={session.state}
                onClick={() => selectSession(session.id)}
                title={`${session.name ?? getWorkspaceName(session.cwd)}\n${session.id}\n${session.cwd}`}
                type="button"
              >
                <span className="session-button__topline">
                  <span className="session-button__name">{session.name ?? getWorkspaceName(session.cwd)}</span>
                  <span className={`session-button__state session-button__state--${session.state}`}>
                    {formatSessionState(session.state)}
                  </span>
                </span>
                <span className="session-button__path">{getWorkspaceName(session.cwd)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

function formatSessionState(state: "idle" | "recovering" | "working") {
  if (state === "working") return "Working"
  if (state === "recovering") return "Recovering"
  return "Idle"
}

function sessionStatePriority(state: "idle" | "recovering" | "working") {
  if (state === "working") return 0
  if (state === "recovering") return 1
  return 2
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}
