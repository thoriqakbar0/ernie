import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { PropsWithChildren } from "react"
import { Effect } from "effect"
import { AgentFailure } from "../packages/agents"
import type { Agent, AgentSettings } from "../packages/agents"
import { useAgents, useDraftCapture } from "./agent-state"
import { useAgentCreation } from "./agent-creation"
import { useConversationCommands } from "./prime-agent-state"

/** Submission feedback belongs to a conversation, independently of its mounted view. */
export type ConversationSubmission =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "creating" | "sending" }>
  | Readonly<{ status: "accepted" | "queued" }>
  | Readonly<{ status: "error" | "unknown"; message: string; canCheck?: boolean }>

type StopState =
  | Readonly<{ status: "idle" | "stopping" }>
  | Readonly<{ status: "error"; message: string }>
type FlowState = Readonly<{ submission: ConversationSubmission; stop: StopState }>
const idle: FlowState = { stop: { status: "idle" }, submission: { status: "idle" } }
type FlowContext = Readonly<{
  states: ReadonlyMap<string, FlowState>
  send: (
    target: { agentId: string; settings?: AgentSettings } | { sessionId: string; delivery?: "steer" | "follow-up" },
  ) => Promise<void>
  release: (sessionId: string) => Promise<void>
  stop: (sessionId: string) => Promise<void>
}>
const context = createContext<FlowContext | undefined>(undefined)

/** Owns create-and-send, queue feedback, and stop operations across chat navigation. */
export const ConversationFlowProvider = ({ children }: PropsWithChildren) => {
  const { client, roster } = useAgents()
  const commands = useConversationCommands()
  const { setAdding } = useAgentCreation()
  const savedAgents = useRef(new Map<string, Agent>())
  const capture = useDraftCapture()
  const [states, setStates] = useState<ReadonlyMap<string, FlowState>>(() => new Map())
  const stateRef = useRef(states)
  const requests = useRef(new Map<string, string>())
  const pending = useRef(new Set<string>())
  const sendDrafts = useRef(new Map<string, () => void>())
  const update = useCallback((key: string, patch: Partial<FlowState>) => {
    const next = new Map(stateRef.current)
    next.set(key, { ...(next.get(key) ?? idle), ...patch })
    stateRef.current = next
    setStates(next)
  }, [])

  const send = useCallback<FlowContext["send"]>(
    async (target) => {
      const key = "sessionId" in target ? target.sessionId : `agent:${target.agentId}`
      if (pending.current.has(key)) {
        return
      }
      const draft = capture(key)
      if (!draft.content.trim() && stateRef.current.get(key)?.submission.status !== "unknown") {
        return
      }
      pending.current.add(key)
      let feedbackKey = key
      let { clear } = draft
      let stage: "creation" | "submission" = "sessionId" in target ? "submission" : "creation"
      const result = await Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) =>
            new AgentFailure({
              cause,
              message:
                stage === "creation"
                  ? "Couldn’t start this conversation. Your message is kept; try again."
                  : "Couldn’t confirm sending. Your text is kept. Check the conversation and connection before sending again.",
            }),
          try: async () => {
            let sessionId: string
            if ("sessionId" in target) {
              ;({ sessionId } = target)
            } else {
              update(key, { submission: { status: "creating" } })
              if (target.settings) {
                const previous =
                  savedAgents.current.get(target.agentId) ??
                  roster.agents.find((agent) => agent.id === target.agentId)
                const saved = await client.save({
                  ...target.settings,
                  expectedNativeName: previous?.name,
                  expectedRevision: previous?.revision ?? 0,
                  id: target.agentId,
                })
                if (!saved.ok) {
                  return { message: saved.error, status: "creation-error" as const }
                }
                savedAgents.current.set(target.agentId, saved.value)
              }
              const requestId = requests.current.get(key) ?? crypto.randomUUID()
              requests.current.set(key, requestId)
              const creation = await client.createConversation({
                agentId: target.agentId,
                requestId,
              })
              if (!creation.ok) {
                return { message: creation.error, status: "creation-error" as const }
              }
              sessionId = creation.value
              requests.current.delete(key)
              pending.current.add(sessionId)
              feedbackKey = sessionId
              clear = draft.transfer(sessionId)
              if (target.settings) {
                setAdding(false)
              }
            }
            stage = "submission"
            update(feedbackKey, { submission: { status: "sending" } })
            // The created session now owns both the transferred draft and send feedback.
            if (feedbackKey !== key) {
              update(key, { submission: { status: "idle" } })
            }
            if (!sendDrafts.current.has(sessionId)) {
              sendDrafts.current.set(sessionId, clear)
            }
            const submission = await commands.submit(sessionId, draft.content, "sessionId" in target ? target.delivery : undefined)
            if (submission.status === "accepted" || submission.status === "queued") {
              sendDrafts.current.get(sessionId)?.()
              sendDrafts.current.delete(sessionId)
              return { status: submission.status }
            }
            if (submission.status === "not-sent") {
              sendDrafts.current.delete(sessionId)
            }
            return {
              message: submission.message,
              canCheck: submission.status === "unknown" ? submission.canCheck : undefined,
              status:
                submission.status === "unknown" ? ("unknown" as const) : ("not-sent" as const),
            }
          },
        }).pipe(
          Effect.match({
            onFailure: (failure) => ({ message: failure.message, status: "failure" as const }),
            onSuccess: (value) => value,
          }),
        ),
      )
      switch (result.status) {
        case "accepted":
        case "queued": {
          update(feedbackKey, { submission: { status: result.status } })
          break
        }
        case "failure": {
          sendDrafts.current.delete(feedbackKey)
          update(feedbackKey, { submission: { message: result.message, status: "error" } })
          break
        }
        case "creation-error": {
          update(feedbackKey, { submission: { message: result.message, status: "error" } })
          break
        }
        case "unknown":
        case "not-sent": {
          update(feedbackKey, {
            submission: {
              message: result.message,
              canCheck: result.canCheck,
              status: result.status === "unknown" ? "unknown" : "error",
            },
          })
          break
        }
        default: {
          result satisfies never
          break
        }
      }
      pending.current.delete(key)
      pending.current.delete(feedbackKey)
    },
    [capture, client, commands, roster.agents, setAdding, update],
  )
  const stop = useCallback(
    async (sessionId: string) => {
      if (stateRef.current.get(sessionId)?.stop.status === "stopping") {
        return
      }
      update(sessionId, { stop: { status: "stopping" } })
      const result = await Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) =>
            new AgentFailure({
              cause,
              message:
                "Couldn’t confirm the stop request. Check the connection and current activity before trying again.",
            }),
          try: () => commands.stop(sessionId),
        }).pipe(
          Effect.match({
            onFailure: (failure) => ({ message: failure.message, status: "error" as const }),
            onSuccess: () => ({ status: "idle" as const }),
          }),
        ),
      )
      update(sessionId, { stop: result })
    },
    [commands, update],
  )
  const release = useCallback(
    async (sessionId: string) => {
      if (pending.current.has(sessionId)) {
        return
      }
      const result = await Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) =>
            new AgentFailure({
              cause,
              message: "Couldn’t release this send. Its outcome is still unknown.",
            }),
          try: () => commands.release(sessionId),
        }).pipe(Effect.match({ onFailure: () => false, onSuccess: () => true })),
      )
      if (!result) {
        return
      }
      sendDrafts.current.delete(sessionId)
      update(sessionId, { submission: { status: "idle" } })
    },
    [commands, update],
  )
  const value = useMemo(() => ({ release, send, states, stop }), [release, send, states, stop])
  return <context.Provider value={value}>{children}</context.Provider>
}

/** Reads feedback and commands scoped to the displayed chat or empty Agent. */
export const useConversationFlow = (key: string) => {
  const state = useContext(context)
  if (!state) {
    throw new Error("ConversationFlowProvider is missing")
  }
  return {
    ...(state.states.get(key) ?? idle),
    release: state.release,
    send: state.send,
    stopAction: state.stop,
  }
}
