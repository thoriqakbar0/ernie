import * as stylex from "@stylexjs/stylex"
import { styles } from "./sidebar.styles"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useMemo, useState } from "react"
import { useViewArgs } from "@zenbujs/core/react"
import { PanelLeftCloseIcon, StarIcon, HistoryIcon } from "lucide-react"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import { describeAgentActivity } from "../../packages/agents"
import { useAgents } from "../agent-state"
import { usePrimeSessionSelection, usePrimeSessionState } from "../prime-agent-state"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { getWorkspaceName } from "./workspace-name"
import { AgentAvatar } from "./agent-avatar"
import { AgentSettingsDialog } from "./agent-settings"

/** Stable Agent navigation with explicitly unassigned workspace history. */
export function Sidebar() {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  return <AgentRoster onClose={onClose}/>
}

/** Production roster, also rendered by isolated development scenarios. */
export function AgentRoster({ onClose }: { onClose: () => void }) {
  const { roster, client, execute, error, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const { selectedSessionId } = usePrimeSessionSelection()
  const [search, setSearch] = useState("")
  const [adding, setAdding] = useState(false)
  const selectedAgentId = selectedSessionId
    ? roster.associations.find((item) => item.sessionId === selectedSessionId)?.agentId
    : roster.selectedAgentId
  const openOnMobile = () => { if (window.matchMedia("(max-width: 720px)").matches) onClose() }
  const [historyOpen, setHistoryOpen] = useState(false)
  const agents = roster.agents.filter((agent) => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const unassigned = sessions.data.filter((session) => !roster.associations.some((item) => item.sessionId === session.id && item.agentId))
  const groups = useMemo(() => {
    const byWorkspace = new Map<string, PrimeSessionSummary[]>()
    for (const session of unassigned) byWorkspace.set(session.cwd, [...(byWorkspace.get(session.cwd) ?? []), session])
    return [...byWorkspace]
  }, [unassigned])
  return <aside aria-label="Agents" {...stylex.props(styles.sessionSidebar)} id="ernie-sidebar">
    <div {...stylex.props(styles.sidebarBrand)}>
      <div {...stylex.props(styles.sidebarBrandIdentity)}><ErnieMark xstyle={styles.sidebarBrandMark}/><p {...stylex.props(styles.sidebarBrandName)}>Ernie</p></div>
      <div {...stylex.props(styles.sidebarBrandActions)}>
        <button aria-label="Add Agent" {...stylex.props(styles.newSessionButton)} type="button" onClick={() => setAdding(true)}><PlusIcon xstyle={rosterStyles.icon}/></button>
        <button aria-controls="ernie-sidebar" aria-expanded="true" aria-label="Close sidebar" {...stylex.props(styles.sidebarCloseButton)} type="button" onClick={onClose}><PanelLeftCloseIcon {...stylex.props(rosterStyles.icon)}/></button>
      </div>
    </div>
    <div {...stylex.props(rosterStyles.search)}><input {...stylex.props(rosterStyles.searchInput)} type="search" aria-label="Search Agents" placeholder="Search Agents" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
    <nav {...stylex.props(rosterStyles.nav)} aria-label="Agents">
      {error ? <p {...stylex.props(rosterStyles.feedback)} role="alert">{error}</p> : null}
      <ul {...stylex.props(rosterStyles.list)}>
        {agents.map((agent) => {
          const conversations = sessions.data.filter((session) => roster.associations.some((item) => item.sessionId === session.id && item.agentId === agent.id))
          const preview = sessions.isPending ? "Loading conversations…" : sessions.isError ? "Activity unavailable" : conversations.some((session) => session.state !== "idle" || session.workerFailed)
            ? describeAgentActivity(conversations)
            : [...conversations].sort((a, b) => (roster.associations.find((item) => item.sessionId === b.id)?.visitedAt ?? 0) - (roster.associations.find((item) => item.sessionId === a.id)?.visitedAt ?? 0))[0]?.name ?? agent.role ?? "Start a conversation"
          return <li key={agent.id} {...stylex.props(rosterStyles.item)}>
            <button {...stylex.props(rosterStyles.row, selectedAgentId === agent.id && rosterStyles.selected)} type="button" aria-current={selectedAgentId === agent.id ? "page" : undefined} disabled={pending > 0}
              onClick={() => { void execute(() => client.select({ agentId: agent.id })).then((result) => { if (result.ok) openOnMobile() }) }} title={`${agent.name}\n${agent.role}\n${preview}`}>
              <AgentAvatar avatar={agent.avatar} working={conversations.some((session) => session.state === "working")}/>
              <span {...stylex.props(rosterStyles.rowText)}><strong {...stylex.props(rosterStyles.name)}>{agent.name}</strong><span {...stylex.props(rosterStyles.preview)}>{preview}</span></span>
            </button>
            <button {...stylex.props(rosterStyles.favorite, agent.pinned && rosterStyles.favorited)} type="button" aria-label={`${agent.pinned ? "Remove" : "Add"} ${agent.name} ${agent.pinned ? "from" : "to"} favorites`} title={agent.pinned ? "Remove from favorites" : "Add to favorites"} aria-pressed={agent.pinned} disabled={pending > 0} onClick={() => { void execute(() => client.pin({ agentId: agent.id, pinned: !agent.pinned })) }}><StarIcon {...stylex.props(rosterStyles.favoriteIcon, agent.pinned && rosterStyles.favoriteIconFilled)}/></button>
          </li>
        })}
      </ul>
      {agents.length === 0 ? <div {...stylex.props(rosterStyles.empty)}><p>{search ? "No matching Agents" : "A familiar place for your work."}</p>{!search ? <button type="button" {...stylex.props(rosterStyles.emptyAction)} onClick={() => setAdding(true)}>Add your first Agent</button> : <p>Search by name or role.</p>}</div> : null}
      <button {...stylex.props(rosterStyles.history)} type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><HistoryIcon {...stylex.props(rosterStyles.icon)}/>History <span>{unassigned.length}</span></button>
      {historyOpen ? <ul {...stylex.props(rosterStyles.historyList)}>
        {sessions.isPending ? <li role="status">Loading conversations…</li> : null}
        {sessions.isError ? <li role="alert">Conversation history is unavailable. {sessions.error instanceof Error ? sessions.error.message : "Try reloading."}</li> : null}
        {groups.map(([cwd, grouped]) => <WorkspaceSessionGroup key={cwd} cwd={cwd} sessions={grouped} selectedSessionId={selectedSessionId} onSelectSession={(sessionId) => { void execute(() => client.openConversation({ sessionId })).then((result) => { if (result.ok) openOnMobile() }) }}/>) }
        {sessions.isSuccess && groups.length === 0 ? <li {...stylex.props(rosterStyles.empty)}>No unassigned conversations</li> : null}
      </ul> : null}
    </nav>
    {adding ? <AgentSettingsDialog onClose={() => setAdding(false)}/> : null}
  </aside>
}

/** Existing conversations retain their workspace grouping and explicit selection. */
function WorkspaceSessionGroup({ cwd, sessions, selectedSessionId, onSelectSession }: {
  cwd: string; sessions: readonly PrimeSessionSummary[]; selectedSessionId?: string; onSelectSession: (id: string) => void
}) {
  return <li><details open={sessions.some((session) => session.id === selectedSessionId) || undefined}>
    <summary title={cwd} {...stylex.props(rosterStyles.workspaceGroup)}>{getWorkspaceName(cwd)} · {sessions.length}</summary>
    {sessions.map((session) => <button type="button" key={session.id} aria-current={session.id === selectedSessionId ? "page" : undefined} title={`${session.name ?? "Untitled conversation"}\n${cwd}`} onClick={() => onSelectSession(session.id)} {...stylex.props(rosterStyles.conversationButton, session.id === selectedSessionId && rosterStyles.selected)}>{session.name ?? "Untitled conversation"}</button>)}
  </details></li>
}
