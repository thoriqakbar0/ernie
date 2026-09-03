import { useActionState, useEffect, useRef, useState } from "react"
import { ConversationTranscript } from "./conversation-transcript"
import { PrimeComposer } from "./prime-composer"
import { PrimeEmptyState } from "./prime-empty-state"
import { SessionInspector } from "./session-inspector"
import { SessionNotice } from "./session-notice"
import { WorkspaceLoading } from "./workspace-loading"
import {
  useCreatePrimeSession,
  usePrimeSessionActions,
  usePrimeModels,
  usePrimeSessionSelection,
  usePrimeSessionSnapshot,
  usePrimeSessions,
  useWorkspacePath,
} from "../prime-agent-state"

type ModelSelection = Readonly<{
  modelId: string
  provider: string
}>

type ModelChangeState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "pending"; selection: ModelSelection }>
  | Readonly<{ status: "error"; message: string }>

const idleModelChange: ModelChangeState = { status: "idle" }

export function ChatWorkspace() {
  const { selectedSessionId: sessionId } = usePrimeSessionSelection()
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const workspacePath = useWorkspacePath()
  const noSessions = sessions.isSuccess && sessions.data.length === 0
  const waitingForCreatedSession = createSession.isPending && sessionId === undefined
  const showEmptyState = (noSessions && sessionId === undefined) || waitingForCreatedSession

  return (
    <section aria-label="Chat workspace" className="chat-workspace" id="ernie-workspace" tabIndex={-1}>
      {showEmptyState ? (
        <div className="workspace-content">
          <PrimeEmptyState
            creating={createSession.isPending}
            cwd={workspacePath.data ?? "this workspace"}
            error={createSession.isError ? getErrorMessage(createSession.error) : undefined}
            onCreate={(prompt) => createSession.mutate(prompt)}
          />
        </div>
      ) : sessionId ? (
        <PrimeSessionWorkspace
          initialPromptError={createSession.data?.attached.snapshot.session.id === sessionId
            ? createSession.data.initialPromptError
            : undefined}
          key={sessionId}
          sessionId={sessionId}
        />
      ) : (
        <div className="workspace-content">
          <WorkspaceLoading />
        </div>
      )}
    </section>
  )
}

function PrimeSessionWorkspace({
  initialPromptError,
  sessionId,
}: Readonly<{
  initialPromptError: string | undefined
  sessionId: string
}>) {
  const snapshotQuery = usePrimeSessionSnapshot(sessionId)
  const actions = usePrimeSessionActions(sessionId)
  const models = usePrimeModels(sessionId)
  const [draft, setDraft] = useState("")
  const [commandError, setCommandError] = useState(initialPromptError)
  const [modelChange, setModelChange] = useState<ModelChangeState>(idleModelChange)
  const modelSelectionRevision = useRef(0)

  useEffect(() => () => {
    modelSelectionRevision.current += 1
  }, [])

  const [, submitAction, submitting] = useActionState(
    async (_previous: undefined, formData: FormData): Promise<undefined> => {
      const content = formData.get("message")
      if (typeof content !== "string" || !content.trim()) return

      setCommandError(undefined)
      try {
        await actions.submit(content)
        setDraft("")
      } catch (cause) {
        setCommandError(cause instanceof Error ? cause.message : "Prime Agent command failed")
      }
    },
    undefined,
  )
  const [, stopAction, stopping] = useActionState(
    async (): Promise<undefined> => {
      setCommandError(undefined)
      try {
        await actions.stop()
      } catch (cause) {
        setCommandError(cause instanceof Error ? cause.message : "Prime Agent command failed")
      }
    },
    undefined,
  )

  if (snapshotQuery.isError) {
    return (
      <div className="open-error" role="alert">
        <h2>Unable to open this session</h2>
        <p>{getErrorMessage(snapshotQuery.error)}.</p>
        <button className="secondary-button" onClick={() => void snapshotQuery.refetch()} type="button">Try again</button>
      </div>
    )
  }

  const snapshot = snapshotQuery.data
  if (!snapshot) return <WorkspaceLoading />

  const connected = snapshot.transport.status === "connected"
  const working = snapshot.session.state === "working"
  const recovering = snapshot.session.state === "recovering"
  const draftHero = snapshot.session.lifecycle === "draft" &&
    snapshot.messages.length === 0 &&
    !working
  const actionError = (modelChange.status === "error" ? modelChange.message : undefined) ??
    commandError

  return (
    <>
      {snapshot.transport.status === "reconnecting" ? (
        <SessionNotice tone="warning">
          <strong>Reconnecting to Prime Agent.</strong> Your session is saved and commands will resume after recovery.
        </SessionNotice>
      ) : null}
      {snapshot.transport.status === "failed" ? (
        <SessionNotice tone="danger">
          <strong>Couldn’t reconnect to Prime Agent.</strong> Commands are paused until the connection returns. <span>{snapshot.transport.error}</span>
        </SessionNotice>
      ) : null}
      {connected && recovering ? (
        <SessionNotice tone="warning">
          <strong>Restoring this Prime Agent session.</strong> Commands will return when recovery finishes.
        </SessionNotice>
      ) : null}
      {actionError ? (
        <SessionNotice tone="danger">
          <strong>The session wasn’t updated.</strong> {actionError}. Try the action again.
        </SessionNotice>
      ) : null}

      <div className="workspace-content">
        <div className={draftHero ? "session-stage session-stage--draft" : "session-stage"}>
          <div className="conversation-pane">
            {draftHero ? null : <ConversationTranscript messages={snapshot.messages} />}
            <div
              className={draftHero ? "composer-placement composer-placement--hero" : "composer-dock"}
              data-composer-placement={draftHero ? "hero" : "docked"}
            >
              <PrimeComposer
                connected={connected}
                draft={draft}
                draftHero={draftHero}
                models={models.data ?? []}
                modelChangePending={modelChange.status === "pending"}
                modelsPending={models.isPending}
                onDraftChange={setDraft}
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
          {draftHero ? null : <SessionInspector snapshot={snapshot} />}
        </div>
      </div>
    </>
  )

  function updateModel(provider: string, modelId: string) {
    if (modelChange.status === "pending") return
    const revision = modelSelectionRevision.current + 1
    modelSelectionRevision.current = revision
    setModelChange({ status: "pending", selection: { provider, modelId } })
    void actions.setModel(provider, modelId)
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
