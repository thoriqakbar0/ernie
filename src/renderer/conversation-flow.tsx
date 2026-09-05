import { createContext, useContext, useRef, useState, type PropsWithChildren } from "react"
import { Effect } from "effect"
import { AgentFailure } from "../packages/agents"
import { useAgents, useDraftCapture } from "./agent-state"
import { useConversationCommands } from "./prime-agent-state"

/** Submission feedback belongs to a conversation, independently of its mounted view. */
export type ConversationSubmission =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "creating" | "sending" }>
  | Readonly<{ status: "accepted" | "queued" }>
  | Readonly<{ status: "error" | "unknown"; message: string }>

type StopState = Readonly<{ status: "idle" | "stopping" }> | Readonly<{ status: "error"; message: string }>
type FlowState = Readonly<{ submission: ConversationSubmission; stop: StopState }>
const idle: FlowState = { submission: { status: "idle" }, stop: { status: "idle" } }
type FlowContext = Readonly<{
  states: ReadonlyMap<string, FlowState>
  send: (target: { agentId: string } | { sessionId: string }) => Promise<void>
  release: (sessionId: string) => Promise<void>
  stop: (sessionId: string) => Promise<void>
}>
const context = createContext<FlowContext | undefined>(undefined)

/** Owns create-and-send, queue feedback, and stop operations across chat navigation. */
export function ConversationFlowProvider({ children }: PropsWithChildren) {
  const { client } = useAgents()
  const commands = useConversationCommands()
  const capture = useDraftCapture()
  const [states, setStates] = useState<ReadonlyMap<string, FlowState>>(() => new Map())
  const stateRef = useRef(states)
  const requests = useRef(new Map<string, string>())
  const created = useRef(new Map<string, string>())
  const pending = useRef(new Set<string>())
  const sendDrafts = useRef(new Map<string, () => void>())
  const update = (key: string, patch: Partial<FlowState>) => {
    const next = new Map(stateRef.current)
    next.set(key, { ...(next.get(key) ?? idle), ...patch })
    stateRef.current = next
    setStates(next)
  }

  const send: FlowContext["send"] = async (target) => {
    const key = "sessionId" in target ? target.sessionId : `agent:${target.agentId}`
    if (pending.current.has(key)) return
    const draft = capture(key)
    if (!draft.content.trim() && stateRef.current.get(key)?.submission.status !== "unknown") return
    pending.current.add(key)
    let feedbackKey = key
    let clear = draft.clear
    let stage: "creation" | "submission" = "sessionId" in target ? "submission" : "creation"
    const result = await Effect.runPromise(Effect.tryPromise({
      try: async () => {
        let sessionId: string
        if ("sessionId" in target) sessionId = target.sessionId
        else {
          update(key, { submission: { status: "creating" } })
          const previous = created.current.get(key)
          if (previous) sessionId = previous
          else {
            const requestId = requests.current.get(key) ?? crypto.randomUUID()
            requests.current.set(key, requestId)
            const creation = await client.createConversation({ agentId: target.agentId, requestId })
            if (!creation.ok) return { status: "creation-error" as const, message: creation.error }
            sessionId = creation.value
            created.current.set(key, sessionId)
          }
          pending.current.add(sessionId)
          feedbackKey = sessionId
          clear = draft.transfer(sessionId)
        }
        stage = "submission"
        update(feedbackKey, { submission: { status: "sending" } })
        if (!sendDrafts.current.has(sessionId)) sendDrafts.current.set(sessionId, clear)
        const submission = await commands.submit(sessionId, draft.content)
        if (submission.status === "accepted" || submission.status === "queued") {
          sendDrafts.current.get(sessionId)?.()
          sendDrafts.current.delete(sessionId)
          return { status: submission.status }
        }
        if (submission.status === "not-sent") sendDrafts.current.delete(sessionId)
        return { status: submission.status === "unknown" ? "unknown" as const : "not-sent" as const, message: submission.message }
      },
      catch: (cause) => new AgentFailure({ message: stage === "creation"
        ? "Couldn’t start this conversation. Your message is kept; try again."
        : "Couldn’t confirm sending. Your text is kept. Check the conversation and connection before sending again.", cause }),
    }).pipe(Effect.match({ onSuccess: (value) => value, onFailure: (failure) => ({ status: "failure" as const, message: failure.message }) })))
    switch (result.status) {
      case "accepted":
      case "queued":
        update(feedbackKey, { submission: { status: result.status } })
        break
      case "creation-error":
      case "failure":
        update(feedbackKey, { submission: { status: "error", message: result.message } })
        break
      case "unknown":
      case "not-sent":
        update(feedbackKey, { submission: { status: result.status === "unknown" ? "unknown" : "error", message: result.message } })
        break
    }
    if (feedbackKey !== key) update(key, { submission: { status: "idle" } })
    pending.current.delete(key)
    pending.current.delete(feedbackKey)
  }
  const stop = async (sessionId: string) => {
    if (stateRef.current.get(sessionId)?.stop.status === "stopping") return
    update(sessionId, { stop: { status: "stopping" } })
    const result = await Effect.runPromise(Effect.tryPromise({
      try: () => commands.stop(sessionId),
      catch: (cause) => new AgentFailure({ message: "Couldn’t confirm the stop request. Check the connection and current activity before trying again.", cause }),
    }).pipe(Effect.match({ onSuccess: () => ({ status: "idle" as const }), onFailure: (failure) => ({ status: "error" as const, message: failure.message }) })))
    update(sessionId, { stop: result })
  }
  const release = async (sessionId: string) => {
    if (pending.current.has(sessionId)) return
    const result = await Effect.runPromise(Effect.tryPromise({
      try: () => commands.release(sessionId),
      catch: (cause) => new AgentFailure({ message: "Couldn’t release this send. Its outcome is still unknown.", cause }),
    }).pipe(Effect.match({ onSuccess: () => true, onFailure: () => false })))
    if (!result) return
    sendDrafts.current.delete(sessionId)
    update(sessionId, { submission: { status: "idle" } })
  }
  return <context.Provider value={{ states, send, stop, release }}>{children}</context.Provider>
}

/** Reads feedback and commands scoped to the displayed chat or empty Agent. */
export function useConversationFlow(key: string) {
  const state = useContext(context)
  if (!state) throw new Error("ConversationFlowProvider is missing")
  return { ...(state.states.get(key) ?? idle), send: state.send, stopAction: state.stop, release: state.release }
}
