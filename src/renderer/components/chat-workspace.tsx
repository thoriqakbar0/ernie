import { styles } from "./chat-workspace.styles"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import type { PrimeModel } from "../../packages/prime-agent"
import { useAgents, useConversationDraft } from "../agent-state"
import type { Agent } from "../../packages/agents"
import { AgentWorkspaceHeader, EmptyAgentWorkspace } from "./agent-workspace"
import { styles as rosterStyles } from "./agent-roster.styles"
import { useConversationFlow } from "../conversation-flow"
import { EmptyConversation } from "./empty-conversation"
import { AgentWelcome } from "./agent-welcome"
import { ConversationTranscript } from "./conversation-transcript"
import { PrimeComposer } from "./prime-composer"
import { SessionNotice } from "./session-notice"
import { WorkspaceLoading } from "./workspace-loading"
import {
  usePrimeSessionActions,
  usePrimeModels,
  usePrimeSessionSelection,
  usePrimeSessionSnapshot,
  usePrimeSessionState,
} from "../prime-agent-state"
type ModelSelection = Readonly<{
  modelId: string
  provider: string
}>
type ModelChangeState =
  | Readonly<{
      status: "idle"
    }>
  | Readonly<{
      status: "pending"
      selection: ModelSelection
    }>
  | Readonly<{
      status: "error"
      message: string
    }>
const idleModelChange: ModelChangeState = {
  status: "idle",
}
const emptyModels: readonly PrimeModel[] = []
export function ChatWorkspace() {
  const { selectedSessionId: sessionId } = usePrimeSessionSelection()
  const { roster, error } = useAgents()
  const activeAgentId = sessionId ? roster.associations.find((item) => item.sessionId === sessionId)?.agentId : roster.selectedAgentId
  const activeAgent = roster.agents.find((agent) => agent.id === activeAgentId)
  const firstSend = useConversationFlow(`agent:${activeAgentId ?? ""}`)
  const creating = firstSend.submission.status === "creating"
  return (
    <section
      aria-label="Chat workspace"
      id="ernie-workspace"
      tabIndex={-1}
      {...stylex.props(styles.chatWorkspace)}
    >
      <AgentWorkspaceHeader agent={activeAgent} sessionId={sessionId}/>
      {error ? <p role="alert" {...stylex.props(rosterStyles.feedback)}>{error}</p> : null}
      {!sessionId || creating ? (
        activeAgent ? <EmptyAgentWorkspace key={activeAgent.id} agent={activeAgent}/> : <AgentWelcome/>
      ) : <PrimeSessionWorkspace agent={activeAgent} key={sessionId} sessionId={sessionId}/>}
    </section>
  )
}
function PrimeSessionWorkspace({ agent, sessionId }: Readonly<{ agent?: Agent; sessionId: string }>) {
  const snapshotQuery = usePrimeSessionSnapshot(sessionId)
  const catalog = usePrimeSessionState()
  const actions = usePrimeSessionActions(sessionId)
  const models = usePrimeModels(sessionId)
  const [draft, setDraft] = useConversationDraft(sessionId)
  const flow = useConversationFlow(sessionId)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  const stopping = flow.stop.status === "stopping"
  const [commandError, setCommandError] = useState<string>()
  const [modelChange, setModelChange] = useState<ModelChangeState>(idleModelChange)
  const modelSelectionRevision = useRef(0)
  useEffect(
    () => () => {
      modelSelectionRevision.current += 1
    },
    [],
  )
  const submitAction = () => flow.send({ sessionId })
  const stopAction = () => flow.stopAction(sessionId)
  const openingError = snapshotQuery.isError ? (
      <div role="alert" {...stylex.props(styles.openError)}>
        <h2>Unable to open this conversation</h2>
        <p {...stylex.props(styles.errorDescription)}>{getErrorMessage(snapshotQuery.error)}.</p>
        <button
          onClick={() => void snapshotQuery.refetch()}
          type="button"
          {...stylex.props(styles.secondaryButton)}
        >
          Try again
        </button>
      </div>
    ) : undefined
  const snapshot = snapshotQuery.data
  const session = snapshot?.session ?? catalog.data.find((item) => item.id === sessionId)
  const connected = !snapshotQuery.isError && snapshot?.transport.status === "connected"
  const working = snapshot?.session.state === "working"
  const recovering = snapshot?.session.state === "recovering"
  const draftHero =
    !openingError && session?.lifecycle === "draft" && !snapshot?.messages.length && !working
  const actionError =
    (modelChange.status === "error" ? modelChange.message : undefined) ?? (flow.stop.status === "error" ? flow.stop.message : undefined) ?? commandError
  return (
    <>
      {snapshot?.transport.status === "reconnecting" ? (
        <SessionNotice tone="warning">
          <strong>Reconnecting to Prime Agent.</strong> Your session is saved and commands will
          resume after recovery.
        </SessionNotice>
      ) : null}
      {snapshot?.transport.status === "failed" ? (
        <SessionNotice tone="danger">
          <strong>Couldn’t reconnect to Prime Agent.</strong> Commands are paused until the
          connection returns. <span>{snapshot.transport.error}</span>
        </SessionNotice>
      ) : null}
      {connected && recovering ? (
        <SessionNotice tone="warning">
          <strong>Restoring this Prime Agent session.</strong> Commands will return when recovery
          finishes.
        </SessionNotice>
      ) : null}
      {actionError ? (
        <SessionNotice tone="danger">
          <strong>The conversation wasn’t updated.</strong> {actionError}. Try the action again.
        </SessionNotice>
      ) : null}

      <div {...stylex.props(styles.workspaceContent)}>
        <div {...stylex.props(styles.sessionStage)}>
          <div {...stylex.props(styles.conversationPane, draftHero && styles.draftConversationPane)}>
            {openingError ?? (draftHero && session ? <EmptyConversation agent={agent} cwd={session.cwd}/>
              : snapshot ? <ConversationTranscript sessionId={sessionId} agentName={agent?.name} messages={snapshot.messages} snapshot={snapshot}/>
              : <WorkspaceLoading/>)}
            <div data-composer-placement={draftHero ? "hero" : "docked"} {...stylex.props(styles.composerDock, draftHero && styles.composerPlacementHero)}>
              <PrimeComposer
                agentName={agent?.name}
                feedback={flow.submission}
                releaseSend={() => flow.release(sessionId)}
                acceptedEffort={snapshot?.useful.sessionContext?.thinkingLevel}
                opening={!snapshot && !snapshotQuery.isError}
                connected={connected}
                draft={draft}
                draftHero={draftHero}
                models={models.data ?? emptyModels}
                modelChangePending={modelChange.status === "pending"}
                modelsPending={models.isPending}
                onDraftChange={setDraft}
                onEffortChange={actions.setEffort}
                onEffortError={setCommandError}
                onModelSelect={(model) => updateModel(model.provider, model.id)}
                recovering={recovering}
                selectedModel={session?.model}
                sessionSelected
                stopAction={stopAction}
                stopping={stopping}
                submitAction={submitAction}
                submitting={submitting}
                working={working}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
  function updateModel(provider: string, modelId: string) {
    if (modelChange.status === "pending") return
    const revision = modelSelectionRevision.current + 1
    modelSelectionRevision.current = revision
    setModelChange({
      status: "pending",
      selection: {
        provider,
        modelId,
      },
    })
    void actions
      .setModel(provider, modelId)
      .then(() => {
        if (modelSelectionRevision.current === revision) setModelChange(idleModelChange)
      })
      .catch((cause: unknown) => {
        if (modelSelectionRevision.current !== revision) return
        setModelChange({
          status: "error",
          message: cause instanceof Error ? cause.message : "Prime Agent command failed",
        })
      })
  }
}
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}
