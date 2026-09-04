import { useEffect, useMemo, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { useViewArgs } from "@zenbujs/core/react"
import { FolderIcon, PanelLeftCloseIcon } from "lucide-react"
import { useIdle } from "phase/react"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessionState,
} from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

export function Sidebar() {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  const idle = useIdle({ timeout: 500 })
  const sessions = usePrimeSessionState()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const visibleSessions = useMemo(
    () => (sessions.data ?? [])
      .filter(({ lifecycle }) => lifecycle !== "archived")
      .toSorted(
        (left, right) => sessionStatePriority(left.state) - sessionStatePriority(right.state),
      ),
    [sessions.data],
  )
  const renderedSessions = idle
    ? visibleSessions
    : visibleSessions.filter((session, index) => index < 24 || session.id === selectedSessionId)
  const workspaceGroups = useMemo(() => {
    const groups = new Map<string, PrimeSessionSummary[]>()
    for (const session of renderedSessions) {
      const group = groups.get(session.cwd)
      if (group) group.push(session)
      else groups.set(session.cwd, [session])
    }
    return [...groups].map(([cwd, groupedSessions]) => ({ cwd, sessions: groupedSessions }))
  }, [renderedSessions])

  return (
    <aside aria-label="Sidebar" className="session-sidebar" id="ernie-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand__identity">
          <ErnieMark className="sidebar-brand__mark" />
          <p className="sidebar-brand__name">Ernie</p>
        </div>
        <div className="sidebar-brand__actions">
          <button
            aria-controls="ernie-sidebar"
            aria-expanded="true"
            aria-label="Close sidebar"
            className="sidebar-close-button"
            onClick={onClose}
            type="button"
          >
            <PanelLeftCloseIcon />
          </button>
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
          ) : visibleSessions.length === 0 ? (
            <li className="sidebar-placeholder">No sessions yet</li>
          ) : workspaceGroups.map((group) => (
            <WorkspaceSessionGroup
              cwd={group.cwd}
              key={group.cwd}
              onSelectSession={selectSession}
              selectedSessionId={selectedSessionId}
              sessions={group.sessions}
            />
          ))}
        </ul>
      </nav>
    </aside>
  )
}

type WorkspaceSessionGroupProps = Readonly<{
  cwd: string
  onSelectSession: (sessionId: string) => void
  selectedSessionId: string | undefined
  sessions: readonly PrimeSessionSummary[]
}>

function WorkspaceSessionGroup({
  cwd,
  onSelectSession,
  selectedSessionId,
  sessions,
}: WorkspaceSessionGroupProps) {
  const selectedSession = sessions.find(({ id }) => id === selectedSessionId)
  const selectedInside = selectedSession !== undefined
  const [open, setOpen] = useState(selectedInside)
  const [showAll, setShowAll] = useState(false)
  const collapsedSessions = selectedSession
    ? [selectedSession, ...sessions.filter(({ id }) => id !== selectedSession.id)].slice(0, 5)
    : sessions.slice(0, 5)
  const displayedSessions = showAll ? sessions : collapsedSessions
  const hiddenSessionCount = sessions.length - displayedSessions.length

  useEffect(() => {
    if (selectedInside) setOpen(true)
  }, [selectedInside])

  return (
    <li className="workspace-session-group">
      <details
        onToggle={(event) => setOpen(event.currentTarget.open)}
        open={open}
      >
        <summary className="workspace-session-group__summary" title={cwd}>
          <FolderIcon />
          <Popover.Root>
            <Popover.Trigger
              aria-label={`Workspace details for ${getWorkspaceName(cwd)}`}
              className="workspace-session-group__name"
              onClick={(event) => event.stopPropagation()}
              openOnHover
            >
              {getWorkspaceName(cwd)}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="start" side="right" sideOffset={8}>
                <Popover.Popup className="workspace-session-popover">
                  <strong>{getWorkspaceName(cwd)}</strong>
                  <span>{cwd}</span>
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          <small>{sessions.length}</small>
        </summary>
        <ul className="workspace-session-group__sessions">
          {displayedSessions.map((session) => (
            <li key={session.id}>
              <button
                aria-current={session.id === selectedSessionId ? "page" : undefined}
                aria-label={session.name ?? session.cwd}
                className="session-button"
                data-session-id={session.id}
                data-session-state={session.state}
                onClick={() => onSelectSession(session.id)}
                title={`${session.name ?? getWorkspaceName(session.cwd)}\n${session.id}\n${session.cwd}`}
                type="button"
              >
                <span className="session-button__name">{session.name ?? "Untitled conversation"}</span>
              </button>
            </li>
          ))}
          {sessions.length > collapsedSessions.length ? (
            <li>
              <button
                aria-expanded={showAll}
                className="workspace-session-group__more"
                onClick={() => setShowAll((current) => !current)}
                type="button"
              >
                {showAll ? "Show less" : `Show ${hiddenSessionCount} more`}
              </button>
            </li>
          ) : null}
        </ul>
      </details>
    </li>
  )
}

function sessionStatePriority(state: "idle" | "recovering" | "working") {
  if (state === "working") return 0
  if (state === "recovering") return 1
  return 2
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}
