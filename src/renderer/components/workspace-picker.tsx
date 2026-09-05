import { styles as sharedStyles } from "../component-styles"
import { styles } from "./workspace-picker.styles"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon, FolderIcon, SearchIcon } from "lucide-react"
import { Effect } from "effect"
import type { AgentResult } from "../../packages/agents"
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
  onSelectSession: (sessionId: string) => Promise<AgentResult<void>>
}>
export function WorkspacePicker({
  activeSessionId,
  sessions,
  onSelectSession,
}: WorkspacePickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [pending, setPending] = useState<string>()
  const [error, setError] = useState<string>()
  const errorRef = useRef<HTMLParagraphElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (error) errorRef.current?.focus() }, [error])
  const select = (workspace: PrimeSessionSummary) => {
    if (pending) return
    if (workspace.id === activeSessionId) { setOpen(false); return }
    setPending(workspace.id)
    setError(undefined)
    void Effect.runPromise(Effect.tryPromise(() => onSelectSession(workspace.id)).pipe(
      Effect.catch(() => Effect.succeed({ ok: false as const, error: "Couldn’t open this conversation. Try again or choose another workspace." })),
      Effect.map((result) => {
        setPending(undefined)
        if (result.ok) setOpen(false)
        else setError(result.error)
      }),
    ))
  }
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
        if (!nextOpen) { setQuery(""); setError(undefined) }
      }}
      open={open}
    >
      <DialogTrigger
        render={<button type="button" {...stylex.props(styles.workspacePickerTrigger)} />}
      >
        {getWorkspaceName(activeSession?.cwd ?? "this workspace")}
        <ChevronDownIcon data-icon="inline-end" {...stylex.props(sharedStyles.controlIcon)} />
      </DialogTrigger>
      <DialogContent xstyle={[styles.workspaceDialog]} aria-busy={Boolean(pending)}>
        <DialogHeader xstyle={styles.header}>
          <DialogTitle>Switch workspace</DialogTitle>
          <DialogDescription>
            Open the conversation shown for a workspace.
          </DialogDescription>
        </DialogHeader>
        <label {...stylex.props(styles.searchLabel)} htmlFor="workspace-search">Find a workspace</label>
        <InputGroup xstyle={styles.searchGroup}>
          <InputGroupInput
            ref={searchRef}
            id="workspace-search"
            disabled={Boolean(pending)}
            xstyle={styles.searchInput}
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
        <p role="status" {...stylex.props(styles.workspaceDialogSummary)}>
          {visibleWorkspaces.length === workspaces.length
            ? `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`
            : `${visibleWorkspaces.length} of ${workspaces.length} workspaces`}
        </p>
        {error ? <p ref={errorRef} tabIndex={-1} role="alert" {...stylex.props(styles.error)}>{error}</p> : null}
        <div aria-label="Workspaces" {...stylex.props(styles.workspaceDialogList)}>
          {visibleWorkspaces.length === 0 ? (
            <div {...stylex.props(styles.workspaceDialogEmpty)}>
              <strong>{query ? `No workspaces match “${query}”` : "No workspaces yet"}</strong>
              <p>{query ? "Try another name or path." : "Start a conversation to add its workspace."}</p>
              {query ? <Button variant="bordered" onClick={() => { setQuery(""); searchRef.current?.focus() }}>Clear search</Button> : null}
            </div>
          ) : (
            visibleWorkspaces.map((workspace) => {
              const active = workspace.id === activeSessionId
              return (
                <Button
                  aria-current={active ? "true" : undefined}
                  key={workspace.cwd}
                  aria-disabled={Boolean(pending)}
                  onClick={() => select(workspace)}
                  type="button"
                  variant="ghost"
                  xstyle={[
                    styles.workspaceDialogOption,
                    active && styles.workspaceDialogOptionCurrent,
                  ]}
                >
                  <FolderIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    {...stylex.props(sharedStyles.controlIcon, styles.optionIcon)}
                  />
                  <span {...stylex.props(styles.optionDetails)}>
                    <span {...stylex.props(styles.optionHeading)}><strong {...stylex.props(styles.optionName)}>
                      {getWorkspaceName(workspace.cwd)}
                    </strong>{active ? <span {...stylex.props(styles.currentLabel)}>Current</span> : null}</span>
                    <small {...stylex.props(styles.optionPath)}>
                      {workspace.cwd}
                    </small>
                    <span {...stylex.props(styles.optionConversation)}>{pending === workspace.id ? "Opening conversation…" : workspace.name ?? "Untitled conversation"}</span>
                  </span>
                  {active ? (
                    <CheckIcon
                      aria-hidden="true"
                      data-icon="inline-end"
                      {...stylex.props(sharedStyles.controlIcon, styles.optionIcon)}
                    />
                  ) : null}
                </Button>
              )
            })
          )}
        </div>
        {visibleWorkspaces.length > 4 ? <p {...stylex.props(styles.workspaceDialogSummary)}>Scroll to browse all workspaces.</p> : null}
      </DialogContent>
    </Dialog>
  )
}
