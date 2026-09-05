import * as stylex from "@stylexjs/stylex"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useRef, useState } from "react"
import { Popover } from "@base-ui/react/popover"
import { HistoryIcon, PlusIcon, SettingsIcon, UsersIcon } from "lucide-react"
import type { Agent } from "../../packages/agents"
import { useAgents, useConversationDraft, useDraftTransfer } from "../agent-state"
import { usePrimeSessionState } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { AgentSettingsDialog } from "./agent-settings"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Textarea } from "./ui/textarea"

/** Conversation navigation belongs to the selected Agent's workspace header. */
export function AgentWorkspaceHeader({ agent, sessionId }: { agent?: Agent; sessionId?: string }) {
  const { roster, client, execute, pending } = useAgents()
  const sessions = usePrimeSessionState()
  const [editing, setEditing] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [search, setSearch] = useState("")
  const requests = useRef(new Map<string, string>())
  const conversations = sessions.data.filter((session) => roster.associations.some((item) => item.sessionId === session.id && item.agentId === agent?.id))
    .toSorted((a, b) => (roster.associations.find((item) => item.sessionId === b.id)?.visitedAt ?? 0) - (roster.associations.find((item) => item.sessionId === a.id)?.visitedAt ?? 0))
  return <header {...stylex.props(rosterStyles.header)}>
    <div {...stylex.props(rosterStyles.identity)}>
      {agent ? <AgentAvatar avatar={agent.avatar}/> : null}
      <div {...stylex.props(rosterStyles.identityText)}><strong {...stylex.props(rosterStyles.name)} title={agent?.name}>{agent?.name ?? "History"}</strong><p {...stylex.props(rosterStyles.role)} title={agent?.role}>{agent?.role ?? sessions.data.find((session) => session.id === sessionId)?.name ?? "Your conversations"}</p></div>
    </div>
    <div {...stylex.props(rosterStyles.actions)}>
      {agent ? <>
        <Popover.Root open={historyOpen} onOpenChange={setHistoryOpen}>
          <Popover.Trigger aria-label="Conversation history" {...stylex.props(rosterStyles.iconButton)}><HistoryIcon {...stylex.props(rosterStyles.icon)}/></Popover.Trigger>
          <Popover.Portal><Popover.Positioner {...stylex.props(rosterStyles.menuPositioner)} align="end" sideOffset={8}><Popover.Popup {...stylex.props(rosterStyles.menu)}>
            <h2 {...stylex.props(rosterStyles.menuTitle)}>Conversations</h2>
            {conversations.length === 0 ? <p {...stylex.props(rosterStyles.menuNote)}>No conversations yet</p> : conversations.map((session) => <button {...stylex.props(rosterStyles.menuButton, session.id === sessionId && rosterStyles.selected)} key={session.id} type="button" aria-current={session.id === sessionId ? "page" : undefined} onClick={() => {
              void execute(() => client.openConversation({ sessionId: session.id })).then((result) => { if (result.ok) setHistoryOpen(false) })
            }}>{session.name ?? "Untitled conversation"}<small {...stylex.props(rosterStyles.count)}>{session.state === "idle" ? "" : session.state}</small></button>)}
          </Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root>
        <button {...stylex.props(rosterStyles.iconButton)} aria-label="New conversation" disabled={pending > 0} type="button" onClick={() => {
          const requestId = requests.current.get(agent.id) ?? crypto.randomUUID()
          requests.current.set(agent.id, requestId)
          void execute(() => client.createConversation({ agentId: agent.id, requestId })).then((result) => { if (result.ok) requests.current.delete(agent.id) })
        }}><PlusIcon {...stylex.props(rosterStyles.icon)}/></button>
        <button {...stylex.props(rosterStyles.iconButton)} aria-label="Edit Agent" type="button" onClick={() => setEditing(true)}><SettingsIcon {...stylex.props(rosterStyles.icon)}/></button>
      </> : null}
      {sessionId ? <Popover.Root open={assignOpen} onOpenChange={(open) => { setAssignOpen(open); if (!open) setSearch("") }}>
        <Popover.Trigger {...stylex.props(rosterStyles.iconButton)} aria-label="Assign conversation"><UsersIcon {...stylex.props(rosterStyles.icon)}/></Popover.Trigger>
        <Popover.Portal><Popover.Positioner {...stylex.props(rosterStyles.menuPositioner)} align="end" sideOffset={8}><Popover.Popup {...stylex.props(rosterStyles.menu)}>
          <h2 {...stylex.props(rosterStyles.menuTitle)}>Assign conversation</h2>
          <Input aria-label="Find an Agent" autoFocus placeholder="Search Agents" value={search} onChange={(event) => setSearch(event.target.value)}/>
          <button {...stylex.props(rosterStyles.menuButton)} type="button" disabled={pending > 0} onClick={() => assign(null)}>Unassigned history</button>
          {roster.agents.filter((item) => `${item.name} ${item.role}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => <button {...stylex.props(rosterStyles.menuButton)} key={item.id} type="button" disabled={pending > 0} onClick={() => assign(item.id)}><AgentAvatar avatar={item.avatar}/>{item.name}</button>)}
          <p {...stylex.props(rosterStyles.menuNote)}>Assignment keeps the conversation’s original instructions and runtime.</p>
        </Popover.Popup></Popover.Positioner></Popover.Portal>
      </Popover.Root> : null}
    </div>
    {editing && agent ? <AgentSettingsDialog agent={agent} onClose={() => setEditing(false)}/> : null}
  </header>
  function assign(agentId: string | null) {
    if (!sessionId) return
    void execute(() => client.assign({ sessionId, agentId })).then((result) => { if (result.ok) setAssignOpen(false) })
  }
}

/** An empty Agent owns its draft until native creation succeeds. */
export function EmptyAgentWorkspace({ agent }: { agent: Agent }) {
  const { client, execute } = useAgents()
  const [draft, setDraft, clearCreatedDraft] = useConversationDraft(`agent:${agent.id}`)
  const transfer = useDraftTransfer()
  const [pending, setPending] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  return <form {...stylex.props(rosterStyles.welcome)} onSubmit={(event) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    void execute(() => client.createConversation({ agentId: agent.id, requestId: requestId.current })).then((result) => {
      setPending(false)
      // The session composer receives this draft without sending a hidden message.
      if (result.ok) { transfer(result.value, draft); clearCreatedDraft() }
    })
  }}>
    <AgentAvatar avatar={agent.avatar}/><h1 {...stylex.props(rosterStyles.welcomeTitle)}>Work with {agent.name}</h1><p {...stylex.props(rosterStyles.menuNote)}>{agent.role || "Start a conversation when you’re ready."}</p>
    <Textarea xstyle={rosterStyles.welcomeInput} aria-label={`Message ${agent.name}`} placeholder="What would you like to work on?" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={pending}/>
    <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create conversation"}</Button>
  </form>
}
