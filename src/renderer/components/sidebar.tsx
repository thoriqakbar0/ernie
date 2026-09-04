import { styles as sharedStyles } from "../component-styles"
import { styles } from "./sidebar.styles"
import * as stylex from "@stylexjs/stylex"
import { useMemo, useState } from "react"
import { useViewArgs } from "@zenbujs/core/react"
import { FolderIcon, MessageCircleIcon, PanelLeftCloseIcon, SearchIcon, XIcon } from "lucide-react"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import {
  useCreatePrimeSession,
  usePrimeSessionSelection,
  usePrimeSessionState,
} from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"

/** Navigate real Prime Agent conversations without implying additional Agent identities. */
export function Sidebar() {
  const { onClose } = useViewArgs<{
    onClose: () => void
  }>()
  const sessions = usePrimeSessionState()
  const createSession = useCreatePrimeSession()
  const { selectedSessionId, selectSession } = usePrimeSessionSelection()
  const [query, setQuery] = useState("")
  const [activeOnly, setActiveOnly] = useState(false)
  const visible = useMemo(
    () => sessions.data.filter((session) => session.lifecycle !== "archived"),
    [sessions.data],
  )
  const working = visible.filter((session) => session.state === "working").length
  const recovering = visible.filter((session) => session.state === "recovering").length
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return visible
      .filter(
        (session) =>
          (!activeOnly || session.state !== "idle") &&
          (!search ||
            [session.name ?? "", session.cwd].some((value) =>
              value.toLocaleLowerCase().includes(search),
            )),
      )
      .toSorted((left, right) => priority(left.state) - priority(right.state))
  }, [visible, query, activeOnly])
  const selected = visible.find((session) => session.id === selectedSessionId)
  return (
    <aside aria-label="Sidebar" id="ernie-sidebar" {...stylex.props(styles.sessionSidebar)}>
      <div {...stylex.props(styles.sidebarBrand)}>
        <div {...stylex.props(styles.sidebarBrandIdentity)}>
          <ErnieMark xstyle={[sharedStyles.controlIcon, styles.sidebarBrandMark]} />
          <p {...stylex.props(styles.sidebarBrandName)}>Ernie</p>
        </div>
        <div {...stylex.props(styles.sidebarBrandActions)}>
          <button
            aria-controls="ernie-sidebar"
            aria-expanded="true"
            aria-label="Close sidebar"
            onClick={onClose}
            type="button"
            {...stylex.props(styles.sidebarCloseButton)}
          >
            <PanelLeftCloseIcon {...stylex.props(sharedStyles.controlIcon, styles.closeIcon)} />
          </button>
          <button
            aria-label="New conversation"
            title="New conversation"
            disabled={createSession.isPending || !sessions.isSuccess}
            onClick={() => {
              setQuery("")
              setActiveOnly(false)
              createSession.mutate()
            }}
            type="button"
            {...stylex.props(styles.newSessionButton)}
          >
            <PlusIcon xstyle={[sharedStyles.controlIcon]} />
          </button>
        </div>
      </div>

      <div {...stylex.props(styles.sessionCreationFeedback)}>
        {createSession.isPending ? (
          <p role="status" {...stylex.props(styles.creationMessage)}>
            Creating your conversation…
          </p>
        ) : null}
        {createSession.isError ? (
          <p role="alert" {...stylex.props(styles.creationMessage)}>
            {createSession.error instanceof Error
              ? createSession.error.message
              : "Could not create conversation"}
            . Try New conversation again.
          </p>
        ) : null}
      </div>

      <nav aria-label="Conversations" id="agent-conversations" {...stylex.props(styles.sidebarNav)}>
        <div {...stylex.props(styles.agentSidebarTools)}>
          <label {...stylex.props(styles.sidebarSearch)}>
            <SearchIcon
              aria-hidden="true"
              {...stylex.props(sharedStyles.controlIcon, styles.searchIcon)}
            />
            <input
              aria-label="Search conversations"
              placeholder="Search conversations"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              {...stylex.props(styles.searchInput)}
            />
            {query ? (
              <button
                aria-label="Clear search"
                onClick={() => setQuery("")}
                type="button"
                {...stylex.props(styles.clearSearchButton)}
              >
                <XIcon {...stylex.props(sharedStyles.controlIcon, styles.clearSearchIcon)} />
              </button>
            ) : null}
          </label>
          <div aria-label="Conversation filters" {...stylex.props(styles.sidebarFilters)}>
            <button
              aria-pressed={!activeOnly}
              onClick={() => setActiveOnly(false)}
              type="button"
              {...stylex.props(styles.filterButton)}
            >
              All <span {...stylex.props(styles.filterCount)}>{visible.length}</span>
            </button>
            <button
              aria-pressed={activeOnly}
              onClick={() => setActiveOnly(true)}
              type="button"
              {...stylex.props(styles.filterButton)}
            >
              Active <span {...stylex.props(styles.filterCount)}>{working + recovering}</span>
            </button>
          </div>
        </div>
        {sessions.isPending ? (
          <div role="status" {...stylex.props(styles.sidebarEmpty)}>
            <span aria-hidden="true" {...stylex.props(styles.sidebarLoadingLines)} />
            <strong {...stylex.props(styles.emptyTitle)}>Connecting to Prime Agent</strong>
            <p {...stylex.props(styles.emptyDescription)}>Your conversations will appear here.</p>
          </div>
        ) : sessions.isError ? (
          <div role="alert" {...stylex.props(styles.sidebarEmpty)}>
            <strong {...stylex.props(styles.emptyTitle, styles.emptyErrorTitle)}>
              Conversations unavailable
            </strong>
            <p {...stylex.props(styles.emptyDescription)}>
              Check the Prime Agent connection. Your saved work remains unchanged.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div role="status" {...stylex.props(styles.sidebarEmpty)}>
            <MessageCircleIcon
              aria-hidden="true"
              {...stylex.props(sharedStyles.controlIcon, styles.emptyIcon)}
            />
            <strong {...stylex.props(styles.emptyTitle)}>
              {query
                ? "No matching conversations"
                : activeOnly
                  ? "Nothing running"
                  : "A place to begin"}
            </strong>
            <p {...stylex.props(styles.emptyDescription)}>
              {query
                ? "Try a conversation name or workspace."
                : activeOnly
                  ? "Active conversations appear here while work runs or recovers."
                  : "Start a conversation with Prime Agent. Return to it whenever you need."}
            </p>
            {query || activeOnly ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("")
                  setActiveOnly(false)
                }}
                {...stylex.props(styles.emptyAction)}
              >
                Show all conversations
              </button>
            ) : null}
          </div>
        ) : (
          <ul {...stylex.props(styles.sidebarSessionList)}>
            {filtered.map((session) => (
              <li key={session.id}>
                <button
                  aria-current={session.id === selectedSessionId ? "page" : undefined}
                  aria-label={session.name ?? session.cwd}
                  data-session-id={session.id}
                  data-session-state={session.state}
                  onClick={() => selectSession(session.id)}
                  title={`${session.name ?? "Untitled conversation"}\n${session.cwd}`}
                  type="button"
                  {...stylex.props(styles.sessionButton)}
                >
                  <span {...stylex.props(styles.sessionButtonHeading)}>
                    <span {...stylex.props(styles.sessionButtonName)}>
                      {session.name?.trim() || getWorkspaceName(session.cwd)}
                    </span>
                    <span
                      {...stylex.props(
                        styles.sessionButtonState,
                        session.state === "working" && styles.workingState,
                        session.state === "recovering" && styles.recoveringState,
                      )}
                    >
                      {session.lifecycle === "draft" && session.state === "idle"
                        ? "Draft"
                        : session.state === "working"
                          ? "Working"
                          : session.state === "recovering"
                            ? "Recovering"
                            : ""}
                    </span>
                  </span>
                  <span {...stylex.props(styles.sessionButtonContext)}>
                    <FolderIcon
                      aria-hidden="true"
                      {...stylex.props(sharedStyles.controlIcon, styles.contextIcon)}
                    />
                    <span {...stylex.props(styles.contextLabel)}>
                      {getWorkspaceName(session.cwd)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>

      <div {...stylex.props(styles.workspaceFooter)}>
        <FolderIcon
          aria-hidden="true"
          {...stylex.props(sharedStyles.controlIcon, styles.workspaceIcon)}
        />
        <span {...stylex.props(styles.workspaceDetails)}>
          <strong {...stylex.props(styles.workspaceName)}>
            {selected ? getWorkspaceName(selected.cwd) : "Local workspace"}
          </strong>
          <span title={selected?.cwd} {...stylex.props(styles.workspacePath)}>
            {selected?.cwd ?? "Choose a conversation to see its workspace"}
          </span>
        </span>
      </div>
    </aside>
  )
}
function priority(state: PrimeSessionSummary["state"]) {
  switch (state) {
    case "working":
      return 0
    case "recovering":
      return 1
    case "idle":
      return 2
  }
}
