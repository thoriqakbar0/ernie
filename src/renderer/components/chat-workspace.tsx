import { SessionSubagentParticipants } from "./session-subagent-participants"
import { RuntimeStatus } from "./runtime-status"
import { useAgentCreation } from "../agent-creation"
import { AppChangeProtection } from "./app-change-protection"
import { AgentNativeSessions } from "./agent-native-sessions"
import { AgentControls } from "./agent-settings"
import { styles } from "./chat-workspace.styles"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import type { PrimeModel } from "../../packages/prime-agent"
import { useAgents, useConversationDraft, useResponseAnnotations } from "../agent-state"
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
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Prime Agent could not start a conversation"

const useSessionWorkspace = (sessionId: string) => {
  const snapshotQuery = usePrimeSessionSnapshot(sessionId)
  const catalog = usePrimeSessionState()
  const actions = usePrimeSessionActions(sessionId)
  const models = usePrimeModels(sessionId)
  const [draft, setDraft] = useConversationDraft(sessionId)
  const feedbackDraft = useResponseAnnotations(sessionId)
  const flow = useConversationFlow(sessionId)
  const submitting = flow.submission.status === "creating" || flow.submission.status === "sending"
  const stopping = flow.stop.status === "stopping"
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
  const snapshot = snapshotQuery.data
  const session = snapshot?.session ?? catalog.data.find((item) => item.id === sessionId)
  const connected = !snapshotQuery.isError && snapshot?.transport.status === "connected"
  const working = snapshot?.session.state === "working"
  const recovering = snapshot?.session.state === "recovering"
  const draftHero =
    !snapshotQuery.isError &&
    session?.lifecycle === "draft" &&
    !snapshot?.messages.length &&
    !working
  const actionError =
    (modelChange.status === "error" ? modelChange.message : undefined) ??
    (flow.stop.status === "error" ? flow.stop.message : undefined)
  const updateModel = async (provider: string, modelId: string) => {
    if (modelChange.status === "pending") {
      return
    }
    const revision = modelSelectionRevision.current + 1
    modelSelectionRevision.current = revision
    setModelChange({
      selection: {
        modelId,
        provider,
      },
      status: "pending",
    })
    try {
      await actions.setModel(provider, modelId)
      if (modelSelectionRevision.current === revision) {
        setModelChange(idleModelChange)
      }
    } catch (error: unknown) {
      if (modelSelectionRevision.current !== revision) {
        return
      }
      setModelChange({
        message: error instanceof Error ? error.message : "Prime Agent command failed",
        status: "error",
      })
    }
  }
  return {
    actionError,
    connected,
    draft,
    draftHero,
    feedbackDraft,
    flow,
    modelChange,
    models,
    recovering,
    session,
    setDraft,
    snapshot,
    snapshotQuery,
    stopAction,
    stopping,
    submitAction,
    submitting,
    updateModel,
    working,
  }
}

const WorkspaceNotices = ({
  snapshot,
  connected,
  recovering,
  actionError,
}: Pick<
  ReturnType<typeof useSessionWorkspace>,
  "snapshot" | "connected" | "recovering" | "actionError"
>) => (
  <>
    {snapshot?.transport.status === "reconnecting" ? (
      <SessionNotice tone="warning">
        <strong>Reconnecting to Prime Agent.</strong> Your session is saved and commands will resume
        after recovery.
      </SessionNotice>
    ) : null}
    {snapshot?.transport.status === "failed" ? (
      <SessionNotice tone="danger">
        <strong>Couldn’t reconnect to Prime Agent.</strong> Commands are paused until the connection
        returns. <span>{snapshot.transport.error}</span>
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
  </>
)

const SessionAgentControls = ({
  agent,
  draftHero,
  snapshot,
}: Readonly<{ agent?: Agent }> &
  Pick<ReturnType<typeof useSessionWorkspace>, "draftHero" | "snapshot">) =>
  agent ? (
    <>
      <AgentControls agent={agent} showTabs={draftHero} />
      {draftHero && agent.root ? <AgentNativeSessions agent={agent} snapshot={snapshot} /> : null}
    </>
  ) : null

const PrimeSessionWorkspace = ({
  agent,
  sessionId,
}: Readonly<{ agent?: Agent; sessionId: string }>) => {
  const {
    snapshotQuery,
    models,
    draft,
    setDraft,
    feedbackDraft,
    flow,
    submitting,
    stopping,
    modelChange,
    submitAction,
    stopAction,
    snapshot,
    session,
    connected,
    working,
    recovering,
    draftHero,
    actionError,
    updateModel,
  } = useSessionWorkspace(sessionId)
  const { add: handleAnnotate, remove: handleRemoveAnnotation } = feedbackDraft
  const openingError = snapshotQuery.isError ? (
    <div role="alert" {...stylex.props(styles.openError)}>
      <h2>Unable to open this conversation</h2>
      <p {...stylex.props(styles.errorDescription)}>{getErrorMessage(snapshotQuery.error)}.</p>
      <button
        onClick={async () => {
          await snapshotQuery.refetch()
        }}
        type="button"
        {...stylex.props(styles.secondaryButton)}
      >
        Try again
      </button>
    </div>
  ) : undefined
  let content = openingError
  if (!content) {
    if (draftHero && session) {
      content = <EmptyConversation agent={agent} cwd={session.cwd} />
    } else if (snapshot) {
      content = (
        <ConversationTranscript
          key={sessionId}
          onAnnotate={handleAnnotate}
          sessionId={sessionId}
          agentName={agent?.name}
          messages={snapshot.messages}
          snapshot={snapshot}
        />
      )
    } else {
      content = <WorkspaceLoading />
    }
  }
  return (
    <>
      <WorkspaceNotices
        snapshot={snapshot}
        connected={connected}
        recovering={recovering}
        actionError={actionError}
      />

      <div {...stylex.props(styles.workspaceContent)}>
        <div {...stylex.props(styles.sessionStage)}>
          <div
            {...stylex.props(styles.conversationPane, draftHero && styles.draftConversationPane)}
          >
            {content}
            <div
              data-composer-placement={draftHero ? "hero" : "docked"}
              {...stylex.props(styles.composerDock, draftHero && styles.composerPlacementHero)}
            >
              {agent?.id.startsWith("ernie-customization-") ? (
                <AppChangeProtection workspace={agent.cwd} working={Boolean(working)} />
              ) : null}
              <PrimeComposer
                sessionId={sessionId}
                agentName={agent?.name}
                feedback={flow.submission}
                releaseSend={() => flow.release(sessionId)}
                opening={!snapshot && !snapshotQuery.isError}
                connected={connected}
                draft={draft}
                annotations={feedbackDraft.annotations}
                onRemoveAnnotation={handleRemoveAnnotation}
                draftHero={draftHero}
                models={models.data ?? emptyModels}
                modelChangePending={modelChange.status === "pending"}
                modelsPending={models.isPending}
                onDraftChange={setDraft}
                onModelSelect={(model) => updateModel(model.provider, model.id)}
                recovering={recovering}
                selectedModel={snapshot?.useful.state.model ?? session?.model}
                sessionSelected
                stopAction={stopAction}
                stopping={stopping}
                submitAction={submitAction}
                submitting={submitting}
                working={working}
              />
              <SessionAgentControls agent={agent} draftHero={draftHero} snapshot={snapshot} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export const ChatWorkspace = () => {
  const { adding } = useAgentCreation()
  const { selectedSessionId: sessionId } = usePrimeSessionSelection()
  const { roster, error } = useAgents()
  const activeAgentId = sessionId
    ? roster.agents.find((item) => item.root?.sessionId === sessionId)?.id
    : roster.selectedAgentId
  const activeAgent = roster.agents.find((agent) => agent.id === activeAgentId)
  const firstSend = useConversationFlow(`agent:${activeAgentId ?? ""}`)
  const creating = firstSend.submission.status === "creating"
  let content
  if (adding || (!sessionId && !activeAgent)) {
    content = <AgentWelcome />
  } else if (!sessionId || creating) {
    content = activeAgent ? (
      <EmptyAgentWorkspace key={activeAgent.id} agent={activeAgent} />
    ) : (
      <AgentWelcome />
    )
  } else {
    content = <PrimeSessionWorkspace agent={activeAgent} key={sessionId} sessionId={sessionId} />
  }
  return (
    <section
      aria-label="Chat workspace"
      id="ernie-workspace"
      tabIndex={-1}
      {...stylex.props(styles.chatWorkspace)}
    >
      <AgentWorkspaceHeader
        agent={adding ? undefined : activeAgent}
        sessionId={adding ? undefined : sessionId}
        participants={adding ? null : <SessionSubagentParticipants sessionId={sessionId} />}
      />
      {error ? (
        <p role="alert" {...stylex.props(rosterStyles.feedback)}>
          {error}
        </p>
      ) : null}
      {content}
      <RuntimeStatus />
    </section>
  )
}
