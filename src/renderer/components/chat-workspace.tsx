import * as stylex from "@stylexjs/stylex"
import { styles } from "./chat-workspace.stylex"
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
    <section aria-label="Chat workspace" {...stylex.props(styles.flex, styles.minH0, styles.minW0, styles.flexCol, styles.bgWhite, styles.textZinc950, styles.darkBgZinc900, styles.darkTextZinc50)}>
      <header {...stylex.props(styles.flex, styles.h48px, styles.shrink0, styles.itemsCenter, styles.justifyBetween, styles.borderB, styles.borderZinc20080, styles.px5, styles.darkBorderZinc800)}>
        <div {...stylex.props(styles.minW0)}>
          <div {...stylex.props(styles.flex, styles.minW0, styles.itemsCenter, styles.gap2)}>
            <h1 {...stylex.props(styles.truncate, styles.textSm, styles.fontSemibold, styles.trackingTight)}>
              {snapshot?.session.name ?? "Prime Agent"}
            </h1>
            {sessionStatus ? (
              <span {...stylex.props(
                styles.shrink0,
                styles.roundedFull,
                styles.px15,
                styles.py05,
                styles.text10px,
                styles.fontMedium,
                sessionStatus.tone === "failed" && styles.bgRed100,
                sessionStatus.tone === "failed" && styles.textRed700,
                sessionStatus.tone === "failed" && styles.darkBgRed950,
                sessionStatus.tone === "failed" && styles.darkTextRed300,
                sessionStatus.tone === "recovering" && styles.bgAmber100,
                sessionStatus.tone === "recovering" && styles.textAmber700,
                sessionStatus.tone === "recovering" && styles.darkBgAmber950,
                sessionStatus.tone === "recovering" && styles.darkTextAmber300,
                sessionStatus.tone === "working" && styles.bgEmerald100,
                sessionStatus.tone === "working" && styles.textEmerald700,
                sessionStatus.tone === "working" && styles.darkBgEmerald950,
                sessionStatus.tone === "working" && styles.darkTextEmerald300,
              )} role="status">
                {sessionStatus.label}
              </span>
            ) : null}
          </div>
          <p {...stylex.props(styles.truncate, styles.textXs, styles.textZinc500)} title={snapshot?.session.cwd ?? workspacePath.data ?? undefined}>
            {snapshot?.session.cwd ?? workspacePath.data ?? ""}
          </p>
        </div>
      </header>

      {snapshot?.transport.status === "reconnecting" ? (
        <p {...stylex.props(styles.borderB, styles.borderAmber200, styles.bgAmber50, styles.px5, styles.py2, styles.textSm, styles.textAmber950, styles.darkBorderAmber900, styles.darkBgAmber950, styles.darkTextAmber100)} role="status">
          Prime Agent is reconnecting. Commands will resume after recovery.
        </p>
      ) : null}
      {snapshot?.transport.status === "failed" ? (
        <p {...stylex.props(styles.borderB, styles.borderRed200, styles.bgRed50, styles.px5, styles.py2, styles.textSm, styles.textRed950, styles.darkBorderRed900, styles.darkBgRed950, styles.darkTextRed100)} role="alert">
          {snapshot.transport.error}
        </p>
      ) : null}
      {submitResult.status === "error" || stopResult.status === "error" || modelError ? (
        <p {...stylex.props(styles.borderB, styles.borderRed200, styles.bgRed50, styles.px5, styles.py2, styles.textSm, styles.textRed950, styles.darkBorderRed900, styles.darkBgRed950, styles.darkTextRed100)} role="alert">
          {modelError ?? (submitResult.status === "error" ? submitResult.message : null) ?? (stopResult.status === "error" ? stopResult.message : null)}
        </p>
      ) : null}

      <div {...stylex.props(styles.relative, styles.minH0, styles.flex1, styles.overflowHidden)}>
        {showEmptyState ? (
          <PrimeEmptyState
            creating={createSession.isPending}
            cwd={workspacePath.data ?? "this workspace"}
            error={createSession.isError ? getErrorMessage(createSession.error) : undefined}
            onCreate={() => createSession.mutate()}
          />
        ) : !snapshot ? (
          <p {...stylex.props(styles.grid, styles.hFull, styles.placeItemsCenter, styles.textSm, styles.textZinc400)} role="status">
            Opening Prime Agent...
          </p>
        ) : (
          <>
            <div
              aria-label="Conversation transcript"
              aria-live="polite"
              {...stylex.props(styles.hFull, styles.overflowYAuto, !draftHero && styles.pb40)}
              role="log"
            >
              {!draftHero ? (
                <div {...stylex.props(styles.mxAuto, styles.flex, styles.wFull, styles.maxW3xl, styles.flexCol, styles.gap7, styles.px6, styles.py10)}>
                  {snapshot.messages.map((message) => (
                    <article {...stylex.props(styles.grid, styles.messageColumns, styles.gap3)} key={message.id}>
                      <div {...stylex.props(
                        styles.grid,
                        styles.size7,
                        styles.placeItemsCenter,
                        styles.roundedMd,
                        styles.text11px,
                        styles.fontSemibold,
                        message.role === "assistant" ? styles.bgZinc950 : styles.bgZinc200,
                        message.role === "assistant" ? styles.textWhite : styles.textZinc700,
                        message.role === "assistant" ? styles.darkBgZinc50 : styles.darkBgZinc700,
                        message.role === "assistant" ? styles.darkTextZinc950 : styles.darkTextZinc100,
                      )}>
                        {message.role === "assistant" ? "P" : "You"}
                      </div>
                      <div {...stylex.props(styles.minW0, styles.pt05)}>
                        <p {...stylex.props(styles.mb1, styles.textXs, styles.fontMedium, styles.textZinc500)}>
                          {message.role === "assistant" ? "Prime Agent" : message.role === "user" ? "You" : "System"}
                        </p>
                        <p {...stylex.props(styles.whitespacePreWrap, styles.text15px, styles.leading6, styles.textZinc800, styles.darkTextZinc200)}>
                          {message.content}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </div>

            <div
              {...stylex.props(
                styles.pointerEventsNone,
                styles.absolute,
                styles.z20,
                draftHero ? styles.inset0 : styles.insetX0,
                draftHero ? styles.flex : styles.bottom0,
                draftHero && styles.itemsCenter,
                !draftHero && styles.bgGradientToT,
                !draftHero && styles.fromWhite,
                !draftHero && styles.viaWhite95,
                !draftHero && styles.toTransparent,
                !draftHero && styles.pb5,
                !draftHero && styles.pt10,
                !draftHero && styles.darkFromZinc900,
                !draftHero && styles.darkViaZinc90095,
              )}
              data-composer-placement={draftHero ? "hero" : "docked"}
            >
              <div {...stylex.props(styles.wFull, styles.px5)}>
                <div {...stylex.props(styles.pointerEventsAuto, styles.relative, styles.mxAuto, styles.wFull, styles.maxW3xl)}>
                  {draftHero ? (
                    <div {...stylex.props(styles.absolute, styles.insetX0, styles.bottomFull, styles.pb8)}>
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
    return { label: "Failed", tone: "failed" as const }
  }
  if (snapshot.transport.status === "reconnecting" || snapshot.session.state === "recovering") {
    return { label: "Recovering", tone: "recovering" as const }
  }
  if (snapshot.session.state === "working") {
    return { label: "Working", tone: "working" as const }
  }
  return undefined
}
