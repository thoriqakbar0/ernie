import { useMemo, useState } from "react"
import { CheckIcon, ChevronDownIcon, FolderIcon, SearchIcon } from "lucide-react"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Button } from "./ui/button"
import { getWorkspaceName } from "./workspace-name"

type WorkspacePickerProps = Readonly<{
  activeSessionId: string
  sessions: readonly PrimeSessionSummary[]
  onSelectSession: (sessionId: string) => void
}>

export function WorkspacePicker({ activeSessionId, sessions, onSelectSession }: WorkspacePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const activeSession = sessions.find(({ id }) => id === activeSessionId)
  const workspaces = useMemo(() => {
    const byPath = new Map<string, PrimeSessionSummary>()
    for (const session of sessions) {
      if (!byPath.has(session.cwd) || session.id === activeSessionId) byPath.set(session.cwd, session)
    }
    return [...byPath.values()].toSorted((left, right) => {
      if (left.id === activeSessionId) return -1
      if (right.id === activeSessionId) return 1
      return getWorkspaceName(left.cwd).localeCompare(getWorkspaceName(right.cwd))
    })
  }, [activeSessionId, sessions])
  const visibleWorkspaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase().replace(/^~(?=\/)/, "")
    if (!normalizedQuery) return workspaces
    return workspaces.filter((workspace) => {
      const label = getWorkspaceName(workspace.cwd)
      return workspace.cwd.toLocaleLowerCase().includes(normalizedQuery) ||
        label.toLocaleLowerCase().includes(normalizedQuery) ||
        workspace.name?.toLocaleLowerCase().includes(normalizedQuery)
    })
  }, [query, workspaces])

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setQuery("")
      }}
      open={open}
    >
      <DialogTrigger
        render={
          <button className="workspace-picker__trigger" type="button" />
        }
      >
        {getWorkspaceName(activeSession?.cwd ?? "this workspace")}
        <ChevronDownIcon data-icon="inline-end" />
      </DialogTrigger>
      <DialogContent className="workspace-dialog">
        <DialogHeader>
          <DialogTitle>Choose a workspace</DialogTitle>
          <DialogDescription>Continue in an existing Prime Agent workspace.</DialogDescription>
        </DialogHeader>
        <label className="workspace-dialog__search">
          <SearchIcon aria-hidden="true" />
          <input
            aria-label="Search workspaces"
            autoComplete="off"
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search ~/work/..."
            spellCheck={false}
            type="search"
            value={query}
          />
        </label>
        <div className="workspace-dialog__list">
          {visibleWorkspaces.length === 0 ? (
            <p className="workspace-dialog__empty">No matching workspace</p>
          ) : visibleWorkspaces.map((workspace) => {
            const active = workspace.id === activeSessionId
            return (
              <Button
                aria-current={active ? "true" : undefined}
                className="workspace-dialog__option"
                key={workspace.cwd}
                onClick={() => {
                  if (!active) onSelectSession(workspace.id)
                  setOpen(false)
                }}
                type="button"
                variant="ghost"
              >
                <FolderIcon data-icon="inline-start" />
                <span>
                  <strong>{getWorkspaceName(workspace.cwd)}</strong>
                  <small>{workspace.cwd}</small>
                </span>
                {active ? <CheckIcon data-icon="inline-end" /> : null}
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
