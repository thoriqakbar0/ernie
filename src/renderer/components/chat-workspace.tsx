import { useActionState, useEffect, useState } from "react"
import { DraftHeroHeadline } from "./draft-hero-headline"
import { PrimeComposer } from "./prime-composer"
import { PrimeEmptyState } from "./prime-empty-state"
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
  const sessionStatus = getSessionStatus(snapshot)

  return (
    <section aria-label="Chat workspace" className="flex min-h-0 min-w-0 flex-col bg-white text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50">
      <header className="flex h-[48px] shrink-0 items-center justify-between border-b border-zinc-200/80 px-5 dark:border-zinc-800">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {snapshot?.session.name ?? "Prime Agent"}
            </h1>
            {sessionStatus ? (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sessionStatus.tone}`} role="status">
                {sessionStatus.label}
              </span>
            ) : null}
          </div>
          <p className="truncate text-xs text-zinc-500" title={snapshot?.session.cwd ?? workspacePath.data ?? undefined}>
            {snapshot?.session.cwd ?? workspacePath.data ?? ""}
          </p>
        </div>
      </header>

      {snapshot?.transport.status === "reconnecting" ? (
        <p className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100" role="status">
          Prime Agent is reconnecting. Commands will resume after recovery.
        </p>
      ) : null}
      {snapshot?.transport.status === "failed" ? (
        <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-100" role="alert">
          {snapshot.transport.error}
        </p>
      ) : null}
      {submitResult.status === "error" || stopResult.status === "error" || modelError ? (
        <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-100" role="alert">
          {modelError ?? (submitResult.status === "error" ? submitResult.message : null) ?? (stopResult.status === "error" ? stopResult.message : null)}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {showEmptyState ? (
          <PrimeEmptyState
            creating={createSession.isPending}
            cwd={workspacePath.data ?? "this workspace"}
            error={createSession.isError ? getErrorMessage(createSession.error) : undefined}
            onCreate={() => createSession.mutate()}
          />
        ) : !snapshot ? (
          <p className="grid h-full place-items-center text-sm text-zinc-400" role="status">
            Opening Prime Agent...
          </p>
        ) : (
          <>
            <div
              aria-label="Conversation transcript"
              aria-live="polite"
              className={`h-full overflow-y-auto ${draftHero ? "" : "pb-40"}`}
              role="log"
            >
              {!draftHero ? (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-10">
                  {snapshot.messages.map((message) => (
                    <article className="grid grid-cols-[28px_minmax(0,1fr)] gap-3" key={message.id}>
                      <div className={`grid size-7 place-items-center rounded-md text-[11px] font-semibold ${message.role === "assistant" ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"}`}>
                        {message.role === "assistant" ? "P" : "You"}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <p className="mb-1 text-xs font-medium text-zinc-500">
                          {message.role === "assistant" ? "Prime Agent" : message.role === "user" ? "You" : "System"}
                        </p>
                        <p className="whitespace-pre-wrap text-[15px] leading-6 text-zinc-800 dark:text-zinc-200">
                          {message.content}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              className={draftHero
                ? "pointer-events-none absolute inset-0 z-20 flex items-center"
                : "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-white via-white/95 to-transparent pb-5 pt-10 dark:from-zinc-900 dark:via-zinc-900/95"}
              data-composer-placement={draftHero ? "hero" : "docked"}
            >
              <div className="w-full px-5">
                <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
                  {draftHero ? (
                    <div className="absolute inset-x-0 bottom-full pb-8">
                      <DraftHeroHeadline cwd={snapshot.session.cwd} />
                    </div>
                  ) : null}
                  <PrimeComposer
                    connected={connected}
                    draft={draft}
                    draftHero={draftHero}
                    models={models.data ?? []}
                    modelsPending={models.isPending}
                    onDraftChange={setDraft}
                    onModelSelect={(model) => {
                      setSelectedModelId(model.id)
                      setModelError(undefined)
                      void actions.setModel(model.provider, model.id).catch((cause: unknown) => {
                        setModelError(cause instanceof Error ? cause.message : "Prime Agent command failed")
                      })
                    }}
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
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Prime Agent could not start a conversation"
}

function getSessionStatus(snapshot: ReturnType<typeof usePrimeSessionSnapshot>["data"]) {
  if (!snapshot) return undefined
  if (snapshot.transport.status === "failed") {
    return { label: "Failed", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" }
  }
  if (snapshot.transport.status === "reconnecting" || snapshot.session.state === "recovering") {
    return { label: "Recovering", tone: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" }
  }
  if (snapshot.session.state === "working") {
    return { label: "Working", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" }
  }
  return undefined
}
