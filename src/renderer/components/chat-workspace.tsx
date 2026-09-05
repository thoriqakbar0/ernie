import { styles } from "./chat-workspace.styles"
import * as stylex from "@stylexjs/stylex"
import { useActionState, useEffect, useRef, useState } from "react"
import type { PrimeModel, PrimeSessionSummary } from "../../packages/prime-agent"
import { useAgents, useConversationDraft } from "../agent-state"
import type { AgentResult } from "../../packages/agents"
import { AgentWorkspaceHeader, EmptyAgentWorkspace } from "./agent-workspace"
import { styles as rosterStyles } from "./agent-roster.styles"
import { ConversationTranscript } from "./conversation-transcript"
import { PrimeComposer } from "./prime-composer"
import { PrimeEmptyState } from "./prime-empty-state"
import { SessionNotice } from "./session-notice"
import { WorkspaceLoading } from "./workspace-loading"
import { WorkspacePicker } from "./workspace-picker"
import {
  useCreatePrimeSession,
  usePrimeSessionActions,
  usePrimeModels,
  usePrimeSessionSelection,
  usePrimeSessionSnapshot,
  usePrimeSessionState,
  useWorkspacePath,
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
  const { selectSession, selectedSessionId: sessionId } = usePrimeSessionSelection()
  const sessions = usePrimeSessionState()
  const createSession = useCreatePrimeSession()
  const workspacePath = useWorkspacePath()
  const { roster, client, execute, error } = useAgents()
  const activeAgentId = sessionId ? roster.associations.find((item) => item.sessionId === sessionId)?.agentId : roster.selectedAgentId
  const activeAgent = roster.agents.find((agent) => agent.id === activeAgentId)
  const noSessions = sessions.isSuccess && sessions.data.length === 0
  const waitingForCreatedSession = createSession.isPending && sessionId === undefined
  const showEmptyState = (noSessions && sessionId === undefined) || waitingForCreatedSession
  return (
    <section
      aria-label="Chat workspace"
      id="ernie-workspace"
      tabIndex={-1}
      {...stylex.props(styles.chatWorkspace)}
    >
      <AgentWorkspaceHeader agent={activeAgent} sessionId={sessionId}/>
      {error ? <p role="alert" {...stylex.props(rosterStyles.feedback)}>{error}</p> : null}
      {!sessionId ? (
        activeAgent ? <EmptyAgentWorkspace key={activeAgent.id} agent={activeAgent}/> : <div {...stylex.props(rosterStyles.welcome)}><h1 {...stylex.props(rosterStyles.welcomeTitle)}>Who will you work with?</h1><p {...stylex.props(rosterStyles.welcomeNote)}>Add an Agent, or open a conversation from history.</p></div>
      ) : showEmptyState ? (
        <div {...stylex.props(styles.workspaceContent)}>
          <PrimeEmptyState
            creating={createSession.isPending}
            cwd={workspacePath.data ?? "this workspace"}
            error={createSession.isError ? getErrorMessage(createSession.error) : undefined}
            onCreate={(prompt) => createSession.mutate(prompt)}
          />
        </div>
      ) : sessionId ? (
        <PrimeSessionWorkspace
          initialPromptError={
            createSession.data?.attached.snapshot.session.id === sessionId
              ? createSession.data.initialPromptError
              : undefined
          }
          key={sessionId}
          onSelectSession={(sessionId) => execute(() => client.openConversation({ sessionId }))}
          sessionId={sessionId}
          sessions={sessions.data}
        />
      ) : (
        <div {...stylex.props(styles.workspaceContent)}>
          <WorkspaceLoading />
        </div>
      )}
    </section>
  )
}
function PrimeSessionWorkspace({
  initialPromptError,
  onSelectSession,
  sessionId,
  sessions,
}: Readonly<{
  initialPromptError: string | undefined
  onSelectSession: (sessionId: string) => Promise<AgentResult<void>>
  sessionId: string
  sessions: readonly PrimeSessionSummary[]
}>) {
  const snapshotQuery = usePrimeSessionSnapshot(sessionId)
  const actions = usePrimeSessionActions(sessionId)
  const models = usePrimeModels(sessionId)
  const [draft, setDraft, clearSubmittedDraft] = useConversationDraft(sessionId)
  const [commandError, setCommandError] = useState(initialPromptError)
  const [modelChange, setModelChange] = useState<ModelChangeState>(idleModelChange)
  const modelSelectionRevision = useRef(0)
  useEffect(
    () => () => {
      modelSelectionRevision.current += 1
    },
    [],
  )
  const [, submitAction, submitting] = useActionState(
    async (_previous: undefined, formData: FormData): Promise<undefined> => {
      const content = formData.get("message")
      if (typeof content !== "string" || !content.trim()) return
      setCommandError(undefined)
      try {
        await actions.submit(content)
        clearSubmittedDraft()
      } catch (cause) {
        setCommandError(cause instanceof Error ? cause.message : "Prime Agent command failed")
      }
    },
    undefined,
  )
  const [, stopAction, stopping] = useActionState(async (): Promise<undefined> => {
    setCommandError(undefined)
    try {
      await actions.stop()
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : "Prime Agent command failed")
    }
  }, undefined)
  if (snapshotQuery.isError) {
    return (
      <div role="alert" {...stylex.props(styles.openError)}>
        <h2>Unable to open this session</h2>
        <p {...stylex.props(styles.errorDescription)}>{getErrorMessage(snapshotQuery.error)}.</p>
        <button
          onClick={() => void snapshotQuery.refetch()}
          type="button"
          {...stylex.props(styles.secondaryButton)}
        >
          Try again
        </button>
      </div>
    )
  }
  const snapshot = snapshotQuery.data
  if (!snapshot) return <WorkspaceLoading />
  const connected = snapshot.transport.status === "connected"
  const working = snapshot.session.state === "working"
  const recovering = snapshot.session.state === "recovering"
  const draftHero =
    snapshot.session.lifecycle === "draft" && snapshot.messages.length === 0 && !working
  const actionError =
    (modelChange.status === "error" ? modelChange.message : undefined) ?? commandError
  return (
    <>
      {snapshot.transport.status === "reconnecting" ? (
        <SessionNotice tone="warning">
          <strong>Reconnecting to Prime Agent.</strong> Your session is saved and commands will
          resume after recovery.
        </SessionNotice>
      ) : null}
      {snapshot.transport.status === "failed" ? (
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
          <strong>The session wasn’t updated.</strong> {actionError}. Try the action again.
        </SessionNotice>
      ) : null}

      <div {...stylex.props(styles.workspaceContent)}>
        <div {...stylex.props(styles.sessionStage, draftHero && styles.sessionStageDraft)}>
          <div
            {...stylex.props(styles.conversationPane, draftHero && styles.draftConversationPane)}
          >
            {draftHero ? null : <ConversationTranscript messages={snapshot.messages} />}
            {draftHero ? (
              <h1 {...stylex.props(styles.draftHeroTitle)}>
                What should we build in{" "}
                <WorkspacePicker
                  activeSessionId={sessionId}
                  onSelectSession={onSelectSession}
                  sessions={sessions}
                />
                ?
              </h1>
            ) : null}
            <div
              data-composer-placement={draftHero ? "hero" : "docked"}
              {...stylex.props(
                !draftHero && styles.composerDock,
                draftHero && styles.composerPlacement,
                draftHero && styles.composerPlacementHero,
              )}
            >
              <PrimeComposer
                acceptedEffort={snapshot.useful.sessionContext?.thinkingLevel}
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
                selectedModel={snapshot.session.model}
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
