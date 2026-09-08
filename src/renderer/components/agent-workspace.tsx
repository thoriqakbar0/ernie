import { useAgentationActive } from "../use-agentation-active"
import { useAppNavigation } from "../app-navigation"
import { AgentHeaderName } from "./agent-header-name"
import type { ReactNode } from "react"
import { BrowserToggle } from "./browser-toggle"
import { ReconnectAgent } from "./reconnect-agent"
import * as stylex from "@stylexjs/stylex"
import { AgentSettingsPopover } from "./agent-settings-popover"
import { styles as rosterStyles } from "./agent-roster.styles"
import type { Agent } from "../../packages/agents"
import { useAgents, useConversationDraft } from "../agent-state"
import { usePrimeSessionState } from "../prime-agent-state"
import { AgentAvatar } from "./agent-avatar"
import { PrimeComposer } from "./prime-composer"
import { useConversationFlow } from "../conversation-flow"
import { EmptyConversation } from "./empty-conversation"
import { styles as chatStyles } from "./chat-workspace.styles"

/** The header identifies the native root; settings open from the header. */
export const AgentWorkspaceHeader = ({
  agent,
  sessionId,
  participants,
  utilities,
}: {
  agent?: Agent
  sessionId?: string
  participants?: ReactNode
  utilities?: ReactNode
}) => {
  const { childChat, navigate } = useAppNavigation()
  const annotating = useAgentationActive()
  return (
    <header {...stylex.props(rosterStyles.header, annotating && rosterStyles.annotationHeader)}>
      <div {...stylex.props(rosterStyles.headerLeading)}>
        <div {...stylex.props(rosterStyles.identity)}>
          <AgentHeaderName
            avatar={agent ? <AgentAvatar avatar={agent.avatar} animated /> : null}
            onClick={() => navigate("conversation")}
            selected={!childChat}
            name={agent?.name ?? (sessionId ? "Saved session" : "")}
          />
        </div>
        {participants}
      </div>
      <div {...stylex.props(rosterStyles.headerUtilities)}>
        {utilities}
        <BrowserToggle />
        {agent ? <AgentSettingsPopover agent={agent} /> : null}
      </div>
    </header>
  )
}

/** An empty Agent sends its first message through the application-owned coordinator. */
export const EmptyAgentWorkspace = ({ agent }: { agent: Agent }) => {
  const { roster, client, execute, pending } = useAgents()
  const catalog = usePrimeSessionState()
  const legacy = roster.associations.filter((item) => item.agentId === agent.id)
  const [draft, setDraft] = useConversationDraft(`agent:${agent.id}`)
  const flow = useConversationFlow(`agent:${agent.id}`)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  if (!agent.root && legacy.length > 1) {
    return (
      <div {...stylex.props(rosterStyles.empty)}>
        <h2>Choose this Agent’s root</h2>
        <p>
          These are separate saved sessions. Choose the one to continue; the others stay in Saved
          sessions.
        </p>
        {legacy.map(({ sessionId }) => (
          <button
            type="button"
            key={sessionId}
            disabled={pending > 0}
            {...stylex.props(rosterStyles.menuButton)}
            onClick={() => {
              void execute(() => client.bindRoot({ agentId: agent.id, sessionId }))
            }}
          >
            {catalog.data.find((item) => item.id === sessionId)?.name ?? sessionId}
          </button>
        ))}
      </div>
    )
  }
  if (agent.root) {
    return <ReconnectAgent key={agent.id} agent={agent} />
  }
  return (
    <div {...stylex.props(chatStyles.workspaceContent)}>
      <div {...stylex.props(chatStyles.conversationPane, chatStyles.draftConversationPane)}>
        <EmptyConversation agent={agent} cwd={agent.cwd} />
        <div
          data-composer-placement="hero"
          {...stylex.props(chatStyles.composerDock, chatStyles.composerPlacementHero)}
        >
          <PrimeComposer
            agentName={agent.name}
            connected={!catalog.connection || catalog.connection.state.status === "connected"}
            draft={draft}
            draftHero
            feedback={flow.submission}
            modelChangePending={false}
            models={[]}
            modelsPending={false}
            onDraftChange={setDraft}
            onModelSelect={() => {
              // Model selection is handled by AgentControls before a session exists.
            }}
            recovering={false}
            selectedModel={undefined}
            sessionSelected={false}
            stopping={false}
            submitting={submitting}
            working={false}
            submitAction={() => flow.send({ agentId: agent.id })}
          />
        </div>
      </div>
    </div>
  )
}
