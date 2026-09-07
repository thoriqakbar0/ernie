import * as stylex from "@stylexjs/stylex"
import { styles } from "./sidebar.styles"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useRef, useState } from "react"
import { useViewArgs } from "@zenbujs/core/react"
import { PanelLeftCloseIcon, StarIcon } from "lucide-react"
import { ContextMenu } from "@base-ui/react/context-menu"
import type { Agent } from "../../packages/agents"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import { useAgents } from "../agent-state"
import { usePrimeSessionSelection, usePrimeSessionState, usePrimeSessionSnapshot } from "../prime-agent-state"
import { useAppNavigation } from "../app-navigation"
import { AppSettings } from "./app-settings"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { GeneratedCharacter } from "./generated-avatar"
import { AgentAvatar } from "./agent-avatar"
import { useAgentCreation } from "../agent-creation"

/** Stable Agent navigation with actions available from each row context menu. */
export function Sidebar() {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  return <AgentRoster onClose={onClose}/>
}

/** Production roster, also rendered by isolated development scenarios. */
export function AgentRoster({ onClose }: { onClose: () => void }) {
  const { navigate } = useAppNavigation()
  const { roster, client, execute, error, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const { selectedSessionId } = usePrimeSessionSelection()
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const { setAdding, setEditing, draftSettingsDocked, setDraftSettingsHost } = useAgentCreation()
  const selectedAgentId = selectedSessionId
    ? roster.associations.find((item) => item.sessionId === selectedSessionId)?.agentId
    : roster.selectedAgentId
  const openOnMobile = () => { navigate("conversation"); if (window.matchMedia("(max-width: 720px)").matches) onClose() }
  // Native lifecycle distinguishes a started conversation from a prepared empty root.
  const activeRootIds = new Set(sessions.data.filter((session) => session.lifecycle === "live" || (session.lifecycle === "draft" && session.state === "working")).map((session) => session.id))
  const agents = roster.agents.filter((agent) => agent.root && activeRootIds.has(agent.root.sessionId)).filter((agent) => `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .toSorted((a, b) => Number(b.pinned) - Number(a.pinned) || a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  return <aside aria-label="Agents" {...stylex.props(styles.sessionSidebar)} id="ernie-sidebar">
    <div {...stylex.props(styles.sidebarBrand)}>
      <div {...stylex.props(styles.sidebarBrandIdentity)}><ErnieMark xstyle={styles.sidebarBrandMark}/><p {...stylex.props(styles.sidebarBrandName)}>Ernie</p></div>
      <div {...stylex.props(styles.sidebarBrandActions)}>
        <button aria-label="Add Agent" {...stylex.props(styles.newSessionButton)} type="button" onClick={() => { setAdding(true); openOnMobile() }}><PlusIcon xstyle={rosterStyles.icon}/></button>
        <button aria-controls="ernie-sidebar" aria-expanded="true" aria-label="Close sidebar" {...stylex.props(styles.sidebarCloseButton)} type="button" onClick={onClose}><PanelLeftCloseIcon {...stylex.props(rosterStyles.icon)}/></button>
      </div>
    </div>
    <div {...stylex.props(rosterStyles.search, draftSettingsDocked && rosterStyles.concealed)}><input ref={searchRef} {...stylex.props(rosterStyles.searchInput)} type="search" aria-label="Search Agents" placeholder="Search Agents" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
    <nav {...stylex.props(rosterStyles.nav, draftSettingsDocked && rosterStyles.concealed)} aria-label="Agents">
      {error ? <p {...stylex.props(rosterStyles.feedback)} role="alert">{error}</p> : null}
      <ul {...stylex.props(rosterStyles.list)}>
        {agents.map((agent) => {
          const conversations = sessions.data.filter((session) => session.id === agent.root?.sessionId)
          const root = conversations[0]
          return <li key={agent.id} {...stylex.props(rosterStyles.item)}>
            <ContextMenu.Root><ContextMenu.Trigger render={<button type="button" disabled={pending > 0}/>} {...stylex.props(rosterStyles.row, selectedAgentId === agent.id && rosterStyles.selected)} aria-current={selectedAgentId === agent.id ? "page" : undefined}
              onClick={() => { void execute(() => client.select({ agentId: agent.id })).then((result) => { if (result.ok) { setAdding(false); openOnMobile() } }) }} title={`${agent.name}\n${agent.role}`}>
              <AgentRosterAvatar agent={agent} root={root}/>
              <span {...stylex.props(rosterStyles.rowText)}><strong {...stylex.props(rosterStyles.name)}>{agent.name}</strong><span {...stylex.props(rosterStyles.preview)}><AgentSubagentCount agent={agent} root={root} catalogPending={sessions.isPending} catalogError={sessions.isError}/></span></span>
            </ContextMenu.Trigger>
            <ContextMenu.Portal><ContextMenu.Positioner><ContextMenu.Popup {...stylex.props(rosterStyles.contextMenu)}>
              <ContextMenu.Item {...stylex.props(rosterStyles.contextItem)} disabled={pending > 0} onClick={() => { void execute(() => client.select({ agentId: agent.id })).then((result) => { if (result.ok) { setAdding(false); openOnMobile() } }) }}>Open Agent</ContextMenu.Item>
              <ContextMenu.Item {...stylex.props(rosterStyles.contextItem)} disabled={pending > 0} onClick={() => { void execute(() => client.select({ agentId: agent.id })).then((result) => { if (result.ok) { setAdding(false); setEditing({ agentId: agent.id, section: "Customize" }); openOnMobile() } }) }}>Customize Agent</ContextMenu.Item>
              <ContextMenu.Item {...stylex.props(rosterStyles.contextItem)} disabled={pending > 0} onClick={() => { void execute(() => client.pin({ agentId: agent.id, pinned: !agent.pinned })) }}>{agent.pinned ? "Remove from favorites" : "Add to favorites"}</ContextMenu.Item>
            </ContextMenu.Popup></ContextMenu.Positioner></ContextMenu.Portal></ContextMenu.Root>
            <button {...stylex.props(rosterStyles.favorite, agent.pinned && rosterStyles.favorited)} type="button" aria-label={`${agent.pinned ? "Remove" : "Add"} ${agent.name} ${agent.pinned ? "from" : "to"} favorites`} title={agent.pinned ? "Remove from favorites" : "Add to favorites"} aria-pressed={agent.pinned} disabled={pending > 0} onClick={() => { void execute(() => client.pin({ agentId: agent.id, pinned: !agent.pinned })) }}><StarIcon {...stylex.props(rosterStyles.favoriteIcon, agent.pinned && rosterStyles.favoriteIconFilled)}/></button>
          </li>
        })}
      </ul>
      {agents.length === 0 && !search && !sessions.isPending && !sessions.isError ? <div {...stylex.props(rosterStyles.ghostRow)}>
        <span {...stylex.props(rosterStyles.hidden)}>No active conversations yet.</span>
        <div aria-hidden="true" {...stylex.props(rosterStyles.ghostAgent)}><GeneratedCharacter seed={42} animated={false}/></div>
        <div {...stylex.props(rosterStyles.ghostCopy)}><p {...stylex.props(rosterStyles.ghostTitle)}>a little quiet here.</p><p>let’s make something together.</p></div>
      </div> : agents.length === 0 ? <div role={search ? "status" : undefined} {...stylex.props(rosterStyles.empty)}>
        <h2 {...stylex.props(rosterStyles.emptyTitle)}>{search ? `No Agents match “${search}”` : sessions.isPending ? "Loading conversations…" : sessions.isError ? "Conversations unavailable" : "No active conversations yet"}</h2>
        {!search ? <p {...stylex.props(rosterStyles.emptyDescription)}>Send your first message to an Agent to see them here.</p> : null}
        <button type="button" {...stylex.props(rosterStyles.emptyAction)} onClick={() => {
          if (search) {
            setSearch("")
            window.requestAnimationFrame(() => searchRef.current?.focus())
          } else { setAdding(true); openOnMobile() }
        }}>{search ? "Clear search" : "Add Agent"}</button>
      </div> : null}
    </nav>
    <div ref={setDraftSettingsHost} {...stylex.props(rosterStyles.settingsHost, !draftSettingsDocked && rosterStyles.concealed)}/>
    <AppSettings/>
  </aside>
}

/** Counts the native child registry; unknown or disconnected data is never treated as zero. */
function AgentSubagentCount({ agent, root, catalogPending, catalogError }: { agent: Agent; root?: PrimeSessionSummary; catalogPending: boolean; catalogError: boolean }) {
  const live = Boolean(root) && root?.lifecycle !== "archived" && !root?.workerFailed && root?.state !== "recovering"
  const snapshot = usePrimeSessionSnapshot(live ? agent.root?.sessionId : undefined)
  if (!agent.root) return <>Choose a native root</>
  if (catalogError) return <>Subagents unavailable</>
  if (catalogPending) return <>Loading subagents…</>
  if (!live) return <>Subagents unavailable</>
  if (snapshot.isError) return <>Subagents unavailable</>
  if (!snapshot.data) return <>Loading subagents…</>
  if (snapshot.data.useful.childrenAvailable === false) return <>Subagents unavailable</>
  const count = snapshot.data.useful.children.length
  if (count === 0) return null
  const stale = snapshot.data.transport.status !== "connected"
  return <>{count} {count === 1 ? "subagent" : "subagents"}{stale ? " · last known" : ""}</>
}

/** Child portraits are stable visual identities derived from native child IDs. */
function AgentRosterAvatar({ agent, root }: { agent: Agent; root?: PrimeSessionSummary }) {
  const available = Boolean(root) && root?.lifecycle !== "archived" && !root?.workerFailed && root?.state !== "recovering"
  const snapshot = usePrimeSessionSnapshot(available ? agent.root?.sessionId : undefined)
  const children = snapshot.data?.useful.children ?? []
  if (!children.length) return <AgentAvatar avatar={agent.avatar} animated working={root?.state === "working"}/>
  return <span {...stylex.props(rosterStyles.avatarGroup)} aria-hidden="true">
    <span {...stylex.props(rosterStyles.groupParent)}><AgentAvatar avatar={agent.avatar} animated working={root?.state === "working"}/></span>
    <span {...stylex.props(rosterStyles.groupChildren)}>{children.map((child) => {
      let seed = 2166136261
      for (const character of child.id) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0
      return <span key={child.id} {...stylex.props(rosterStyles.groupChild)}><AgentAvatar avatar={{ kind: "generated", seed }} size="small" animated working={child.status === "running"}/></span>
    })}</span>
  </span>
}
