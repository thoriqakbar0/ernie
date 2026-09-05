import * as stylex from "@stylexjs/stylex"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useRef, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { HistoryIcon, PlusIcon, SettingsIcon, UsersIcon, EllipsisIcon, ArrowLeftIcon } from "lucide-react"
import type { Agent } from "../../packages/agents"
import { useAgents, useConversationDraft } from "../agent-state"
import { usePrimeSessionState } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { AgentSettingsDialog } from "./agent-settings"
import { Input } from "./ui/input"
import { PrimeComposer } from "./prime-composer"
import { useConversationFlow } from "../conversation-flow"
import { EmptyConversation } from "./empty-conversation"
import { styles as chatStyles } from "./chat-workspace.styles"
import { getWorkspaceName } from "./workspace-name"

/** Conversation navigation belongs to the selected Agent's workspace header. */
export function AgentWorkspaceHeader({ agent, sessionId }: { agent?: Agent; sessionId?: string }) {
  const { roster, client, execute, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState("")
  const requests = useRef(new Map<string, string>())
  const selectedSession = sessions.data.find((session) => session.id === sessionId)
  const conversations = sessions.data.filter((session) => roster.associations.some((item) => item.sessionId === session.id && item.agentId === agent?.id))
    .toSorted((a, b) => (roster.associations.find((item) => item.sessionId === b.id)?.visitedAt ?? 0) - (roster.associations.find((item) => item.sessionId === a.id)?.visitedAt ?? 0))
  const startConversation = () => {
    if (!agent) return
    const requestId = requests.current.get(agent.id) ?? crypto.randomUUID()
    requests.current.set(agent.id, requestId)
    void execute(() => client.createConversation({ agentId: agent.id, requestId })).then((result) => {
      if (result.ok) {
        requests.current.delete(agent.id)
        setHistoryOpen(false)
      }
    })
  }
  if (!agent && !sessionId) return null
  return <header {...stylex.props(rosterStyles.header)}>
    <div {...stylex.props(rosterStyles.identity)}>
      {agent ? <AgentAvatar avatar={agent.avatar}/> : null}
      <div {...stylex.props(rosterStyles.identityText)}><strong {...stylex.props(rosterStyles.name)} title={agent?.name}>{agent?.name ?? "History"}</strong><p {...stylex.props(rosterStyles.role)} title={selectedSession?.name}>{selectedSession?.name ?? "New conversation"}</p><p {...stylex.props(rosterStyles.workspacePath)} title={selectedSession?.cwd ?? agent?.cwd}>{agent?.role ? `${agent.role} · ` : ""}{getWorkspaceName(selectedSession?.cwd ?? agent?.cwd ?? "No workspace")}</p></div>
    </div>
    <div {...stylex.props(rosterStyles.actions)}>
      {agent ? <>
        <Popover.Root open={historyOpen} onOpenChange={setHistoryOpen}>
          <Popover.Trigger aria-label="Conversation history" {...stylex.props(rosterStyles.iconButton)}><HistoryIcon {...stylex.props(rosterStyles.icon)}/></Popover.Trigger>
          <Popover.Portal><Popover.Positioner {...stylex.props(rosterStyles.menuPositioner)} align="end" sideOffset={8}><Popover.Popup {...stylex.props(rosterStyles.menu)}>
            <h2 {...stylex.props(rosterStyles.menuTitle)}>Conversations</h2>
            {conversations.length === 0 ? <><p {...stylex.props(rosterStyles.menuNote)}>No conversations yet.</p><button type="button" disabled={pending > 0} onClick={startConversation} {...stylex.props(rosterStyles.menuButton)}><PlusIcon {...stylex.props(rosterStyles.icon)}/>New conversation</button></> : conversations.map((session) => <button {...stylex.props(rosterStyles.menuButton, session.id === sessionId && rosterStyles.selected)} key={session.id} type="button" aria-current={session.id === sessionId ? "page" : undefined} onClick={() => {
              void execute(() => client.openConversation({ sessionId: session.id })).then((result) => { if (result.ok) setHistoryOpen(false) })
            }}><span {...stylex.props(rosterStyles.menuButtonCopy)}><span {...stylex.props(rosterStyles.menuButtonTitle)}>{session.name ?? "Untitled conversation"}</span><small {...stylex.props(rosterStyles.menuButtonMeta)}>{getWorkspaceName(session.cwd)}</small></span><small {...stylex.props(rosterStyles.menuButtonStatus)}>{session.workerFailed ? "Worker failed" : session.state === "idle" ? "" : session.activitySummary ?? session.state}</small></button>)}
          </Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root>
        <button {...stylex.props(rosterStyles.iconButton)} title="New conversation" aria-label="New conversation" disabled={pending > 0} type="button" onClick={startConversation}><PlusIcon {...stylex.props(rosterStyles.icon)}/></button>
      </> : null}
      <Popover.Root open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) { setAssignOpen(false); setSearch("") } }}>
        <Popover.Trigger {...stylex.props(rosterStyles.iconButton)} aria-label="Conversation options"><EllipsisIcon {...stylex.props(rosterStyles.icon)}/></Popover.Trigger>
        <Popover.Portal><Popover.Positioner {...stylex.props(rosterStyles.menuPositioner)} align="end" sideOffset={8}><Popover.Popup {...stylex.props(rosterStyles.menu)}>
          {assignOpen ? <>
            <button type="button" {...stylex.props(rosterStyles.menuButton)} onClick={() => setAssignOpen(false)}><ArrowLeftIcon {...stylex.props(rosterStyles.icon)}/>Conversation options</button>
            <h2 {...stylex.props(rosterStyles.menuTitle)}>Assign conversation</h2>
            <Input aria-label="Find an Agent" autoFocus placeholder="Search Agents" value={search} onChange={(event) => setSearch(event.target.value)}/>
            <button {...stylex.props(rosterStyles.menuButton)} type="button" disabled={pending > 0} onClick={() => assign(null)}>Unassigned history</button>
            {roster.agents.filter((item) => `${item.name} ${item.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => <button {...stylex.props(rosterStyles.menuButton)} key={item.id} type="button" disabled={pending > 0} onClick={() => assign(item.id)}><AgentAvatar avatar={item.avatar}/>{item.name}</button>)}
            <p {...stylex.props(rosterStyles.menuNote)}>Assignment keeps the conversation’s original instructions and runtime.</p>
          </> : <>
            <h2 {...stylex.props(rosterStyles.menuTitle)}>Conversation options</h2>
            {agent ? <button type="button" {...stylex.props(rosterStyles.menuButton)} onClick={() => { setMenuOpen(false); setEditing(true) }}><SettingsIcon {...stylex.props(rosterStyles.icon)}/>Agent settings</button> : null}
            {sessionId ? <button type="button" {...stylex.props(rosterStyles.menuButton)} onClick={() => setAssignOpen(true)}><UsersIcon {...stylex.props(rosterStyles.icon)}/>Assign conversation</button> : null}
            <p {...stylex.props(rosterStyles.menuNote)}>Workspace: {selectedSession?.cwd ?? agent?.cwd ?? "No conversation selected"}</p>
          </>}
        </Popover.Popup></Popover.Positioner></Popover.Portal>
      </Popover.Root>
    </div>
    {editing && agent ? <AgentSettingsDialog agent={agent} onClose={() => setEditing(false)}/> : null}
  </header>
  function assign(agentId: string | null) {
    if (!sessionId) return
    void execute(() => client.assign({ sessionId, agentId })).then((result) => { if (result.ok) { setAssignOpen(false); setMenuOpen(false) } })
  }
}

/** An empty Agent sends its first message through the application-owned coordinator. */
export function EmptyAgentWorkspace({ agent }: { agent: Agent }) {
  const [draft, setDraft] = useConversationDraft(`agent:${agent.id}`)
  const flow = useConversationFlow(`agent:${agent.id}`)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  return <div {...stylex.props(chatStyles.workspaceContent)}><div {...stylex.props(chatStyles.conversationPane, chatStyles.draftConversationPane)}>
    <EmptyConversation agent={agent}/>
    <div data-composer-placement="hero" {...stylex.props(chatStyles.composerDock, chatStyles.composerPlacementHero)}>
      <PrimeComposer agentName={agent.name} connected draft={draft} draftHero feedback={flow.submission}
        acceptedEffort={undefined} modelChangePending={false} models={[]} modelsPending={false}
        onDraftChange={setDraft} onEffortChange={async () => {}} onEffortError={() => {}} onModelSelect={() => {}}
        recovering={false} selectedModel={undefined} sessionSelected={false} stopAction={() => {}}
        stopping={false} submitting={submitting} working={false}
        submitAction={() => flow.send({ agentId: agent.id })}/>
    </div>
  </div></div>
}
