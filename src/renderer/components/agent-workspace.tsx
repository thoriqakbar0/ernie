import * as stylex from "@stylexjs/stylex"
import { useAgentCreation } from "../agent-creation"
import { styles as rosterStyles } from "./agent-roster.styles"
import { SettingsIcon } from "lucide-react"
import type { Agent } from "../../packages/agents"
import { useAgents, useConversationDraft } from "../agent-state"
import { usePrimeSessionState } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { AgentControls } from "./agent-settings"
import { PrimeComposer } from "./prime-composer"
import { useConversationFlow } from "../conversation-flow"
import { EmptyConversation } from "./empty-conversation"
import { styles as chatStyles } from "./chat-workspace.styles"

/** The header identifies the native root; settings open beside its composer. */
export function AgentWorkspaceHeader({ agent, sessionId }: { agent?: Agent; sessionId?: string }) {
  const { setEditing } = useAgentCreation()
  return agent || sessionId ? <header {...stylex.props(rosterStyles.header)}>
    <div {...stylex.props(rosterStyles.identity)}>{agent ? <AgentAvatar avatar={agent.avatar} animated/> : null}<strong {...stylex.props(rosterStyles.headerName)}>{agent?.name ?? "Saved session"}</strong></div>
    {agent ? <button type="button" aria-label="Agent settings" {...stylex.props(rosterStyles.iconButton, rosterStyles.headerAction)} onClick={() => setEditing({ agentId: agent.id, section: "Customize" })}><SettingsIcon {...stylex.props(rosterStyles.icon)}/></button> : null}
  </header> : null
}

/** An empty Agent sends its first message through the application-owned coordinator. */
export function EmptyAgentWorkspace({ agent }: { agent: Agent }) {
  const { roster, client, execute, pending } = useAgents()
  const catalog = usePrimeSessionState()
  const legacy = roster.associations.filter((item) => item.agentId === agent.id)
  const [draft, setDraft] = useConversationDraft(`agent:${agent.id}`)
  const flow = useConversationFlow(`agent:${agent.id}`)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  if (!agent.root && legacy.length > 1) return <div {...stylex.props(rosterStyles.empty)}>
    <h2>Choose this Agent’s root</h2><p>These are separate saved sessions. Choose the one to continue; the others stay in Saved sessions.</p>
    {legacy.map(({ sessionId }) => <button type="button" key={sessionId} disabled={pending > 0} {...stylex.props(rosterStyles.menuButton)} onClick={() => { void execute(() => client.bindRoot({ agentId: agent.id, sessionId })) }}>{catalog.data.find((item) => item.id === sessionId)?.name ?? sessionId}</button>)}
  </div>
  if (agent.root) return <div {...stylex.props(rosterStyles.empty)}><h2>Reconnect {agent.name}</h2><p>The saved root is kept. Reconnect to continue its context.</p><button type="button" disabled={pending > 0} {...stylex.props(rosterStyles.menuButton)} onClick={() => { void execute(() => client.select({ agentId: agent.id })) }}>Reconnect Agent</button><AgentControls agent={agent}/></div>
  return <div {...stylex.props(chatStyles.workspaceContent)}><div {...stylex.props(chatStyles.conversationPane, chatStyles.draftConversationPane)}>
    <EmptyConversation agent={agent} cwd={agent.cwd}/>
    <div data-composer-placement="hero" {...stylex.props(chatStyles.composerDock, chatStyles.composerPlacementHero)}>
      <PrimeComposer agentName={agent.name} connected draft={draft} draftHero feedback={flow.submission}
        acceptedEffort={undefined} modelChangePending={false} models={[]} modelsPending={false}
        onDraftChange={setDraft} onEffortChange={async () => {}} onEffortError={() => {}} onModelSelect={() => {}}
        recovering={false} selectedModel={undefined} sessionSelected={false} stopAction={() => {}}
        stopping={false} submitting={submitting} working={false}
        submitAction={() => flow.send({ agentId: agent.id })}/>
      <AgentControls agent={agent}/>
    </div>
  </div></div>
}
