import { SubagentChats, SubagentChatLabel } from "./subagent-chats"
import { Fragment, useRef, useState } from "react"
import { SubagentAvatar } from "./subagent-avatar"
import * as stylex from "@stylexjs/stylex"
import { styles } from "./sidebar.styles"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useViewArgs } from "@zenbujs/core/react"
import { PanelLeftCloseIcon, StarIcon } from "lucide-react"
import type { Agent } from "../../packages/agents"
import type { PrimeSessionSummary } from "../../packages/prime-agent"
import { useAgents } from "../agent-state"
import {
  useConnectPrimeDaemon,
  usePrimeSessionSelection,
  usePrimeSessionState,
  usePrimeSessionSnapshot,
} from "../prime-agent-state"
import { useAppNavigation } from "../app-navigation"
import { AppSettings } from "./app-settings"
import { ErnieMark } from "./ernie-mark"
import { PlusIcon } from "./plus-icon"
import { SidebarEmptyState } from "./sidebar-empty-state"
import { AgentAvatar } from "./agent-avatar"
import { useAgentCreation } from "../agent-creation"

/** Counts the native child registry; unknown or disconnected data is never treated as zero. */
const AgentSubagentStatus = ({
  agent,
  root,
  catalogPending,
  catalogError,
}: {
  agent: Agent
  root?: PrimeSessionSummary
  catalogPending: boolean
  catalogError: boolean
}) => {
  const live =
    Boolean(root) &&
    root?.lifecycle !== "archived" &&
    !root?.workerFailed &&
    root?.state !== "recovering"
  const snapshot = usePrimeSessionSnapshot(live ? agent.root?.sessionId : undefined)
  if (!agent.root) {
    return <>Choose a native root</>
  }
  if (catalogError) {
    return <>Subagents unavailable. Try reopening this agent.</>
  }
  if (catalogPending) {
    return <>Loading subagents…</>
  }
  if (!live) {
    return <>Subagents unavailable. Try reopening this agent.</>
  }
  if (snapshot.isError) {
    return <>Subagents unavailable. Try reopening this agent.</>
  }
  if (!snapshot.data) {
    return <>Loading subagents…</>
  }
  if (snapshot.data.useful.childrenAvailable === false) {
    return <>Subagents unavailable. Try reopening this agent.</>
  }
  return snapshot.data.transport.status !== "connected" ? <>Showing last known subagents</> : null
}

/** Child portraits are stable visual identities derived from native child IDs. */
const AgentRosterAvatar = ({ agent, root }: { agent: Agent; root?: PrimeSessionSummary }) => {
  const available =
    Boolean(root) &&
    root?.lifecycle !== "archived" &&
    !root?.workerFailed &&
    root?.state !== "recovering"
  const snapshot = usePrimeSessionSnapshot(available ? agent.root?.sessionId : undefined)
  const children = snapshot.data?.useful.children ?? []
  if (!children.length) {
    return <AgentAvatar avatar={agent.avatar} animated working={root?.state === "working"} />
  }
  return (
    <span {...stylex.props(rosterStyles.avatarGroup)} aria-hidden="true">
      <span {...stylex.props(rosterStyles.groupParent)}>
        <AgentAvatar avatar={agent.avatar} animated working={root?.state === "working"} />
      </span>
      <span {...stylex.props(rosterStyles.groupChildren)}>
        {children.map((child, index) => (
          <span
            key={child.id}
            {...stylex.props(
              rosterStyles.groupChild(
                24 +
                  17 *
                    Math.cos(
                      Math.PI *
                        (0.12 +
                          0.76 * (children.length === 1 ? 0.5 : index / (children.length - 1))),
                    ),
                23 +
                  17 *
                    Math.sin(
                      Math.PI *
                        (0.12 +
                          0.76 * (children.length === 1 ? 0.5 : index / (children.length - 1))),
                    ),
                Math.min(1, 3 / children.length),
              ),
            )}
          >
            <SubagentAvatar childId={child.id} working={child.status === "running"} />
          </span>
        ))}
      </span>
    </span>
  )
}

/** Production roster, also rendered by isolated development scenarios. */
export const AgentRoster = ({ onClose }: { onClose: () => void }) => {
  const { navigate, page, childChat } = useAppNavigation()
  const { roster, client, execute, error, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const connectDaemon = useConnectPrimeDaemon()
  const { selectedSessionId } = usePrimeSessionSelection()
  const [search, setSearch] = useState("")
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const { setAdding, draftSettingsDocked, setDraftSettingsHost } = useAgentCreation()
  const selectedAgentId = selectedSessionId
    ? roster.associations.find((item) => item.sessionId === selectedSessionId)?.agentId
    : roster.selectedAgentId
  const openOnMobile = () => {
    navigate("conversation")
    if (window.matchMedia("(max-width: 720px)").matches) {
      onClose()
    }
  }
  // Native lifecycle distinguishes a started conversation from a prepared empty root.
  const activeRootIds = new Set<string>()
  for (const session of sessions.data) {
    if (
      session.lifecycle === "live" ||
      (session.lifecycle === "draft" && session.state === "working")
    ) {
      activeRootIds.add(session.id)
    }
  }
  const agents = roster.agents
    .filter(
      (agent) =>
        agent.root &&
        activeRootIds.has(agent.root.sessionId) &&
        `${agent.name} ${agent.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    )
    .toSorted(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    )
  return (
    <aside aria-label="Agents" {...stylex.props(styles.sessionSidebar)} id="ernie-sidebar">
      <div {...stylex.props(styles.sidebarBrand)}>
        <div {...stylex.props(styles.sidebarBrandIdentity)}>
          <ErnieMark xstyle={styles.sidebarBrandMark} />
          <p {...stylex.props(styles.sidebarBrandName)}>Ernie</p>
        </div>
        <div {...stylex.props(styles.sidebarBrandActions)}>
          <button
            aria-label="Add Agent"
            {...stylex.props(styles.newSessionButton)}
            type="button"
            onClick={() => {
              setAdding(true)
              openOnMobile()
            }}
          >
            <PlusIcon xstyle={rosterStyles.icon} />
          </button>
          <button
            aria-controls="ernie-sidebar"
            aria-expanded="true"
            aria-label="Close sidebar"
            {...stylex.props(styles.sidebarCloseButton)}
            type="button"
            onClick={onClose}
          >
            <PanelLeftCloseIcon {...stylex.props(rosterStyles.icon)} />
          </button>
        </div>
      </div>
      <div {...stylex.props(rosterStyles.search, draftSettingsDocked && rosterStyles.concealed)}>
        <input
          ref={searchRef}
          {...stylex.props(rosterStyles.searchInput)}
          type="search"
          aria-label="Search Agents"
          placeholder="Search Agents"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <nav
        {...stylex.props(rosterStyles.nav, draftSettingsDocked && rosterStyles.concealed)}
        aria-label="Agents"
      >
        {error && page !== "conversation" ? (
          <div role="alert" {...stylex.props(rosterStyles.feedback)}>
            <details>
              <summary>Last action failed</summary>
              {error}
            </details>
          </div>
        ) : null}
        <ul {...stylex.props(rosterStyles.list)}>
          {agents.map((agent) => {
            const root = sessions.data.find((session) => session.id === agent.root?.sessionId)
            return (
              <Fragment key={agent.id}>
                <li {...stylex.props(rosterStyles.item)}>
                  <div
                    {...stylex.props(
                      rosterStyles.row,
                      rosterStyles.parentRow,
                      !childChat && selectedAgentId === agent.id && rosterStyles.selected,
                    )}
                  >
                  <button
                    type="button"
                    disabled={pending > 0}
                    aria-label={agent.name}
                    {...stylex.props(rosterStyles.parentTrigger)}
                    aria-current={!childChat && selectedAgentId === agent.id ? "page" : undefined}
                    onClick={async () => {
                      const result = await execute(() => client.select({ agentId: agent.id }))
                      if (result.ok) {
                        setAdding(false)
                        openOnMobile()
                      }
                    }}
                    title={`${agent.name}\n${agent.role}`}
                  >
                  </button>
                    <AgentRosterAvatar agent={agent} root={root} />
                    <span {...stylex.props(rosterStyles.rowText)}>
                      <strong {...stylex.props(rosterStyles.name)}>{agent.name}</strong>
                      {agent.root ? <SubagentChatLabel parentId={agent.root.sessionId} expanded={Boolean(expandedAgents[agent.id]) || Boolean(search.trim())} onToggle={() => setExpandedAgents((current) => ({ ...current, [agent.id]: !current[agent.id] }))} /> : null}
                      <span {...stylex.props(rosterStyles.preview)}>
                        <AgentSubagentStatus
                          agent={agent}
                          root={root}
                          catalogPending={sessions.isPending}
                          catalogError={sessions.isError}
                        />
                      </span>
                    </span>
                  </div>
                  <button
                    {...stylex.props(rosterStyles.favorite, agent.pinned && rosterStyles.favorited)}
                    type="button"
                    aria-label={`${agent.pinned ? "Remove" : "Add"} ${agent.name} ${agent.pinned ? "from" : "to"} favorites`}
                    title={agent.pinned ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={agent.pinned}
                    disabled={pending > 0}
                    onClick={() => {
                      void execute(() => client.pin({ agentId: agent.id, pinned: !agent.pinned }))
                    }}
                  >
                    <StarIcon
                      fill={agent.pinned ? "currentColor" : "none"}
                      {...stylex.props(rosterStyles.favoriteIcon)}
                    />
                  </button>
                </li>
                {agent.root ? (
                  <li>
                    <SubagentChats
                      expanded={Boolean(expandedAgents[agent.id])}
                      parentId={agent.root.sessionId}
                      parentName={agent.name}
                      search={search}
                      onOpen={async () => {
                        const result = await execute(() => client.select({ agentId: agent.id }))
                        if (!result.ok) return false
                        setAdding(false)
                        openOnMobile()
                        return true
                      }}
                    />
                  </li>
                ) : null}
              </Fragment>
            )
          })}
        </ul>
        {agents.length === 0 ? (
          <SidebarEmptyState
            showRecovery={page !== "conversation"}
            search={search}
            pending={sessions.isPending}
            error={sessions.isError}
            connection={sessions.connection}
            retry={connectDaemon}
            clearSearch={() => {
              setSearch("")
              window.requestAnimationFrame(() => searchRef.current?.focus())
            }}
          />
        ) : null}
      </nav>
      <div
        ref={setDraftSettingsHost}
        {...stylex.props(rosterStyles.settingsHost, !draftSettingsDocked && rosterStyles.concealed)}
      />
      <AppSettings />
    </aside>
  )
}

/** Stable Agent navigation with direct actions available from each row. */
export const Sidebar = () => {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  return <AgentRoster onClose={onClose} />
}
