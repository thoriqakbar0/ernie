import { SubagentAvatar } from "./subagent-avatar"
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
const AgentSubagentCount = ({
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
    return <>Subagents unavailable</>
  }
  if (catalogPending) {
    return <>Loading subagents…</>
  }
  if (!live) {
    return <>Subagents unavailable</>
  }
  if (snapshot.isError) {
    return <>Subagents unavailable</>
  }
  if (!snapshot.data) {
    return <>Loading subagents…</>
  }
  if (snapshot.data.useful.childrenAvailable === false) {
    return <>Subagents unavailable</>
  }
  const count = snapshot.data.useful.children.length
  if (count === 0) {
    return null
  }
  const stale = snapshot.data.transport.status !== "connected"
  return (
    <>
      {count} {count === 1 ? "subagent" : "subagents"}
      {stale ? " · last known" : ""}
    </>
  )
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
        {children.map((child) => (
          <span key={child.id} {...stylex.props(rosterStyles.groupChild)}>
            <SubagentAvatar childId={child.id} working={child.status === "running"} />
          </span>
        ))}
      </span>
    </span>
  )
}

/** Production roster, also rendered by isolated development scenarios. */
export const AgentRoster = ({ onClose }: { onClose: () => void }) => {
  const { navigate } = useAppNavigation()
  const { roster, client, execute, error, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const connectDaemon = useConnectPrimeDaemon()
  const { selectedSessionId } = usePrimeSessionSelection()
  const [search, setSearch] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const { setAdding, setEditing, draftSettingsDocked, setDraftSettingsHost } = useAgentCreation()
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
        {error ? (
          <p {...stylex.props(rosterStyles.feedback)} role="alert">
            {error}
          </p>
        ) : null}
        <ul {...stylex.props(rosterStyles.list)}>
          {agents.map((agent) => {
            const root = sessions.data.find((session) => session.id === agent.root?.sessionId)
            return (
              <li key={agent.id} {...stylex.props(rosterStyles.item)}>
                <ContextMenu.Root>
                  <ContextMenu.Trigger
                    render={<button type="button" aria-label={agent.name} disabled={pending > 0} />}
                    {...stylex.props(
                      rosterStyles.row,
                      selectedAgentId === agent.id && rosterStyles.selected,
                    )}
                    aria-current={selectedAgentId === agent.id ? "page" : undefined}
                    onClick={async () => {
                      const result = await execute(() => client.select({ agentId: agent.id }))
                      if (result.ok) {
                        setAdding(false)
                        openOnMobile()
                      }
                    }}
                    title={`${agent.name}\n${agent.role}`}
                  >
                    <AgentRosterAvatar agent={agent} root={root} />
                    <span {...stylex.props(rosterStyles.rowText)}>
                      <strong {...stylex.props(rosterStyles.name)}>{agent.name}</strong>
                      <span {...stylex.props(rosterStyles.preview)}>
                        <AgentSubagentCount
                          agent={agent}
                          root={root}
                          catalogPending={sessions.isPending}
                          catalogError={sessions.isError}
                        />
                      </span>
                    </span>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Positioner>
                      <ContextMenu.Popup {...stylex.props(rosterStyles.contextMenu)}>
                        <ContextMenu.Item
                          {...stylex.props(rosterStyles.contextItem)}
                          disabled={pending > 0}
                          onClick={async () => {
                            const result = await execute(() => client.select({ agentId: agent.id }))
                            if (result.ok) {
                              setAdding(false)
                              openOnMobile()
                            }
                          }}
                        >
                          Open Agent
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          {...stylex.props(rosterStyles.contextItem)}
                          disabled={pending > 0}
                          onClick={async () => {
                            const result = await execute(() => client.select({ agentId: agent.id }))
                            if (result.ok) {
                              setAdding(false)
                              setEditing({ agentId: agent.id, section: "Customize" })
                              openOnMobile()
                            }
                          }}
                        >
                          Customize Agent
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          {...stylex.props(rosterStyles.contextItem)}
                          disabled={pending > 0}
                          onClick={() => {
                            void execute(() =>
                              client.pin({ agentId: agent.id, pinned: !agent.pinned }),
                            )
                          }}
                        >
                          {agent.pinned ? "Remove from favorites" : "Add to favorites"}
                        </ContextMenu.Item>
                      </ContextMenu.Popup>
                    </ContextMenu.Positioner>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
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
                    {...stylex.props(
                      rosterStyles.favoriteIcon,
                      agent.pinned && rosterStyles.favoriteIconFilled,
                    )}
                  />
                </button>
              </li>
            )
          })}
        </ul>
        {agents.length === 0 ? (
          <SidebarEmptyState
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

/** Stable Agent navigation with actions available from each row context menu. */
export const Sidebar = () => {
  const { onClose } = useViewArgs<{ onClose: () => void }>()
  return <AgentRoster onClose={onClose} />
}
