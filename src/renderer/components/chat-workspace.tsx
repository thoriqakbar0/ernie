import { useActionState, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ConversationTranscript } from "./conversation-transcript"
import { DraftHeroHeadline } from "./draft-hero-headline"
import { PrimeComposer } from "./prime-composer"
import { PrimeEmptyState } from "./prime-empty-state"
import { SessionInspector } from "./session-inspector"
import { getWorkspaceName } from "./workspace-name"
import {
  useCreatePrimeSession,
  usePrimeSessionActions,
  usePrimeModels,
  usePrimeSessionSelection,
  usePrimeSessionSnapshot,
  usePrimeSessions,
  useWorkspacePath,
} from "../prime-agent-state"

type ActionResult =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "error"; message: string }>

const idleAction: ActionResult = { status: "idle" }

export function ChatWorkspace() {
  const { selectedSessionId: sessionId } = usePrimeSessionSelection()
  const sessions = usePrimeSessions()
  const createSession = useCreatePrimeSession()
  const snapshotQuery = usePrimeSessionSnapshot(sessionId)
  const actions = usePrimeSessionActions(sessionId)
  const models = usePrimeModels(sessionId)
  const workspacePath = useWorkspacePath()
  const [draft, setDraft] = useState("")
  const [selectedModelId, setSelectedModelId] = useState("")
  const [modelError, setModelError] = useState<string>()
  const modelSelectionRevision = useRef(0)

  useEffect(() => {
    setDraft("")
    setModelError(undefined)
  }, [sessionId])
  useEffect(() => {
    setSelectedModelId(snapshotQuery.data?.session.model?.id ?? "")
  }, [snapshotQuery.data?.session.model?.id])

  const [submitResult, submitAction, submitting] = useActionState(
    async (_previous: ActionResult, formData: FormData): Promise<ActionResult> => {
      const content = formData.get("message")
      if (typeof content !== "string" || !content.trim()) return idleAction

      try {
        await actions.submit(content)
        setDraft("")
        return idleAction
      } catch (cause) {
        return {
          status: "error",
          message: cause instanceof Error ? cause.message : "Prime Agent command failed",
        }
      }
    },
    idleAction,
  )
  const [stopResult, stopAction, stopping] = useActionState(
    async (): Promise<ActionResult> => {
      try {
        await actions.stop()
        return idleAction
      } catch (cause) {
        return {
          status: "error",
          message: cause instanceof Error ? cause.message : "Prime Agent command failed",
        }
      }
    },
    idleAction,
  )

  const snapshot = snapshotQuery.data
  const connected = snapshot?.transport.status === "connected"
  const working = snapshot?.session.state === "working"
  const draftHero = snapshot?.session.lifecycle === "draft" &&
    snapshot.messages.length === 0 &&
    !working
  const noSessions = sessions.isSuccess && sessions.data.length === 0
  const waitingForCreatedSession = createSession.isPending && snapshot === undefined
  const showEmptyState = (noSessions && sessionId === undefined) || waitingForCreatedSession
  const actionError = modelError ??
    (submitResult.status === "error" ? submitResult.message : undefined) ??
    (stopResult.status === "error" ? stopResult.message : undefined)

  return (
    <section aria-label="Chat workspace" className="chat-workspace" id="ernie-workspace" tabIndex={-1}>
      <header className="workspace-header">
        <div className="workspace-header__copy">
          <h1>{snapshot?.session.name ?? "Prime Agent"}</h1>
          <p title={snapshot?.session.cwd ?? workspacePath.data ?? undefined}>
            {snapshot ? getWorkspaceName(snapshot.session.cwd) : getWorkspaceName(workspacePath.data ?? "Workspace")}
            <span aria-hidden="true"> · </span>
            <span className="workspace-header__path">{snapshot?.session.cwd ?? workspacePath.data ?? "Opening workspace"}</span>
          </p>
        </div>
      </header>

      {snapshot?.transport.status === "reconnecting" ? (
        <SessionNotice tone="warning">
          <strong>Reconnecting to Prime Agent.</strong> Your session is saved and commands will resume after recovery.
        </SessionNotice>
      ) : null}
      {snapshot?.transport.status === "failed" ? (
        <SessionNotice tone="danger">
          <strong>Couldn’t reconnect to Prime Agent.</strong> Commands are paused until the connection returns. <span>{snapshot.transport.error}</span>
        </SessionNotice>
      ) : null}
      {actionError ? (
        <SessionNotice tone="danger">
          <strong>The session wasn’t updated.</strong> {actionError}. Try the action again.
        </SessionNotice>
      ) : null}

      <div className="workspace-content">
        {showEmptyState ? (
          <PrimeEmptyState
            creating={createSession.isPending}
            cwd={workspacePath.data ?? "this workspace"}
            error={createSession.isError ? getErrorMessage(createSession.error) : undefined}
            onCreate={() => createSession.mutate()}
          />
        ) : snapshotQuery.isError ? (
          <div className="open-error" role="alert">
            <h2>Unable to open this session</h2>
            <p>{getErrorMessage(snapshotQuery.error)}.</p>
            <button className="secondary-button" onClick={() => void snapshotQuery.refetch()} type="button">Try again</button>
          </div>
        ) : !snapshot ? (
          <WorkspaceLoading />
        ) : (
          <div className={draftHero ? "session-stage session-stage--draft" : "session-stage"}>
            <div className="conversation-pane">
              {draftHero ? (
                <div className="draft-heading-stage">
                  <DraftHeroHeadline cwd={snapshot.session.cwd} />
                </div>
              ) : <ConversationTranscript messages={snapshot.messages} />}
              <div
                className={draftHero ? "composer-placement composer-placement--hero" : "composer-dock"}
                data-composer-placement={draftHero ? "hero" : "docked"}
              >
                <PrimeComposer
                  connected={connected}
                  draft={draft}
                  draftHero={draftHero}
                  models={models.data ?? []}
                  modelsPending={models.isPending}
                  onDraftChange={setDraft}
                  onModelSelect={(model) => updateModel(model.provider, model.id)}
                  selectedModelId={selectedModelId}
                  sessionSelected
                  stopAction={stopAction}
                  stopping={stopping}
                  submitAction={submitAction}
                  submitting={submitting}
                  working={working}
                />
              </div>
            </div>
            {!draftHero ? <SessionInspector snapshot={snapshot} /> : null}
          </div>
        )}
      </div>
    </section>
  )

  function updateModel(provider: string, modelId: string) {
    const authoritativeModelId = snapshot?.session.model?.id ?? ""
    const revision = modelSelectionRevision.current + 1
    modelSelectionRevision.current = revision
    setSelectedModelId(modelId)
    setModelError(undefined)
    void actions.setModel(provider, modelId).catch((cause: unknown) => {
      if (modelSelectionRevision.current !== revision) return
      setSelectedModelId(authoritativeModelId)
      setModelError(cause instanceof Error ? cause.message : "Prime Agent command failed")
    })
  }
}

function SessionNotice({ children, tone }: Readonly<{
  children: ReactNode
  tone: "danger" | "warning"
}>) {
  return (
    <div className={`session-notice session-notice--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <NoticeIcon />
      <p>{children}</p>
    </div>
  )
}

function WorkspaceLoading() {
  return (
    <div aria-label="Opening Prime Agent" className="workspace-loading" role="status">
      <span className="workspace-loading__rule" />
      <span>Opening Prime Agent…</span>
      <span className="workspace-loading__rule" />
    </div>
  )
}

function NoticeIcon() {
  return (
    <svg aria-hidden="true" className="control-icon" fill="none" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.7v3.8M8 11.2v.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}
