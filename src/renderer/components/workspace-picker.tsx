import { styles as sharedStyles } from "../component-styles"
import { styles } from "./workspace-picker.styles"
import * as stylex from "@stylexjs/stylex"
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "./ui/input-group"
import { getWorkspaceName } from "./workspace-name"
type WorkspacePickerProps = Readonly<{
  activeSessionId: string
  sessions: readonly PrimeSessionSummary[]
  onSelectSession: (sessionId: string) => void
}>
export function WorkspacePicker({
  activeSessionId,
  sessions,
  onSelectSession,
}: WorkspacePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const activeSession = sessions.find(({ id }) => id === activeSessionId)
  const workspaces = useMemo(() => {
    const byPath = new Map<string, PrimeSessionSummary>()
    for (const session of sessions) {
      if (!byPath.has(session.cwd) || session.id === activeSessionId)
        byPath.set(session.cwd, session)
    }
    return [...byPath.values()].toSorted((left, right) => {
      if (left.id === activeSessionId) return -1
      if (right.id === activeSessionId) return 1
      return getWorkspaceName(left.cwd).localeCompare(getWorkspaceName(right.cwd))
    })
  }, [activeSessionId, sessions])
  const visibleWorkspaces = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLocaleLowerCase()
      .replace(/^~(?=\/)/, "")
    if (!normalizedQuery) return workspaces
    return workspaces.filter((workspace) => {
      const label = getWorkspaceName(workspace.cwd)
      return (
        workspace.cwd.toLocaleLowerCase().includes(normalizedQuery) ||
        label.toLocaleLowerCase().includes(normalizedQuery) ||
        workspace.name?.toLocaleLowerCase().includes(normalizedQuery)
      )
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
        render={<button type="button" {...stylex.props(styles.workspacePickerTrigger)} />}
      >
        {getWorkspaceName(activeSession?.cwd ?? "this workspace")}
        <ChevronDownIcon data-icon="inline-end" {...stylex.props(sharedStyles.controlIcon)} />
      </DialogTrigger>
      <DialogContent xstyle={[styles.workspaceDialog]}>
        <DialogHeader>
          <DialogTitle>Open a workspace</DialogTitle>
          <DialogDescription>
            Choose a workspace to open a Prime Agent conversation.
          </DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupInput
            aria-label="Search workspaces"
            autoComplete="off"
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search by workspace name or path"
            spellCheck={false}
            type="search"
            value={query}
          />
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden="true" {...stylex.props(sharedStyles.controlIcon)} />
          </InputGroupAddon>
        </InputGroup>
        <p {...stylex.props(styles.workspaceDialogSummary)}>
          {visibleWorkspaces.length === workspaces.length
            ? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
            : `${visibleWorkspaces.length} of ${workspaces.length} workspaces`}
        </p>
        <div {...stylex.props(styles.workspaceDialogList)}>
          {visibleWorkspaces.length === 0 ? (
            <p {...stylex.props(styles.workspaceDialogEmpty)}>No matching workspace</p>
          ) : (
            visibleWorkspaces.map((workspace) => {
              const active = workspace.id === activeSessionId
              return (
                <Button
                  aria-current={active ? "true" : undefined}
                  key={workspace.cwd}
                  onClick={() => {
                    if (!active) onSelectSession(workspace.id)
                    setOpen(false)
                  }}
                  type="button"
                  variant="ghost"
                  xstyle={[styles.workspaceDialogOption]}
                >
                  <FolderIcon
                    data-icon="inline-start"
                    {...stylex.props(sharedStyles.controlIcon, styles.optionIcon)}
                  />
                  <span {...stylex.props(styles.optionDetails)}>
                    <strong {...stylex.props(styles.optionName)}>
                      {getWorkspaceName(workspace.cwd)}
                    </strong>
                    <small {...stylex.props(styles.optionPath)}>
                      {active ? `Current workspace · ${workspace.cwd}` : workspace.cwd}
                    </small>
                  </span>
                  {active ? (
                    <CheckIcon
                      data-icon="inline-end"
                      {...stylex.props(sharedStyles.controlIcon, styles.optionIcon)}
                    />
                  ) : null}
                </Button>
              )
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
