import { createContext, useContext, useMemo, useRef, useState, type PropsWithChildren } from "react"
import { useDb, useRpc } from "@zenbujs/core/react"
import { Effect, Option, Schema } from "effect"
import { AgentFailure, Roster, emptyRoster, type AgentResult } from "../packages/agents"
import { usePrimeSessionState } from "./prime-agent-state"
import type { AgentsService } from "../main/services/agents"

/** Narrow client seam shared by live UI and isolated development scenarios. */
export type AgentClient = Pick<AgentsService, "save" | "pin" | "select" | "assign" | "openConversation" | "createConversation" | "chooseWorkspace" | "bindRoot">
type AgentContext = Readonly<{
  roster: Roster
  client: AgentClient
  error: string | undefined
  pending: number
  execute: <A>(operation: () => Promise<AgentResult<A>>) => Promise<AgentResult<A>>
}>
const context = createContext<AgentContext | undefined>(undefined)

/** Owns roster commands and feedback; Zenbu remains the persisted state authority. */
export function AgentStateProvider({ children, roster, client }: PropsWithChildren<{ roster?: Roster; client?: AgentClient }>) {
  return roster && client
    ? <AgentState roster={roster} client={client}>{children}</AgentState>
    : <LiveAgentState>{children}</LiveAgentState>
}
function LiveAgentState({ children }: PropsWithChildren) {
  const rpc = useRpc()
  const [client] = useState<AgentClient>(() => ({
    bindRoot: (input) => rpc.app.agents.bindRoot(input),
    chooseWorkspace: () => rpc.app.agents.chooseWorkspace(),
    save: (input) => rpc.app.agents.save(input),
    pin: (input) => rpc.app.agents.pin(input),
    select: (input) => rpc.app.agents.select(input),
    assign: (input) => rpc.app.agents.assign(input),
    openConversation: (input) => rpc.app.agents.openConversation(input),
    createConversation: (input) => rpc.app.agents.createConversation(input),
  }))
  const native = usePrimeSessionState()
  const raw = useDb((root) => root.app?.roster)
  const roster = useMemo(() => Option.getOrUndefined(Schema.decodeUnknownOption(Roster)(raw)), [raw])
  const presented = useMemo(() => roster ? { ...roster, agents: roster.agents.map((agent) => {
    const root = native.data.find((session) => session.id === agent.root?.sessionId)
    return root ? { ...agent, name: root.name ?? agent.name } : agent
  }) } : emptyRoster, [roster, native.data])
  return <AgentState roster={presented} client={client} readError={raw !== undefined && !roster ? "The saved Agent roster could not be read." : undefined}>{children}</AgentState>
}
function AgentState({ children, roster, client, readError }: PropsWithChildren<{ roster: Roster; client: AgentClient; readError?: string }>) {
  const [error, setError] = useState<string>()
  const [pending, setPending] = useState(0)
  const execute = async <A,>(operation: () => Promise<AgentResult<A>>): Promise<AgentResult<A>> => {
    setPending((count) => count + 1)
    setError(undefined)
    const result = await Effect.runPromise(Effect.tryPromise({
      try: operation,
      catch: (cause) => new AgentFailure({ message: "Ernie could not save this action. Your input is kept; try again.", cause }),
    }).pipe(Effect.catch((failure) => Effect.succeed({ ok: false as const, error: failure.message }))))
    setPending((count) => count - 1)
    if (!result.ok) setError(result.error)
    return result
  }
  return <context.Provider value={{ roster, client, execute, error: readError ?? error, pending }}>{children}</context.Provider>
}
/** Reads the roster and its owned command boundary. */
export function useAgents() {
  const state = useContext(context)
  if (!state) throw new Error("AgentStateProvider is missing")
  return state
}

type DraftEntry = Readonly<{ content: string }>
const draftsContext = createContext<{
  drafts: ReadonlyMap<string, DraftEntry>
  setDraft: (key: string, value: string) => void
  clearDraft: (key: string, expected: DraftEntry | undefined) => void
  capture: (key: string) => { content: string; clear: () => void; transfer: (sessionId: string) => () => void }
} | undefined>(undefined)
/** Retains unsent text by session (or empty Agent) for this application lifetime. */
export function ConversationDraftProvider({ children }: PropsWithChildren) {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, DraftEntry>>(() => new Map())
  const current = useRef(drafts)
  current.current = drafts
  const clear = (key: string, expected: DraftEntry | undefined) => setDrafts((previous) => {
    if (previous.get(key) !== expected) return previous
    const next = new Map(previous)
    next.delete(key)
    return next
  })
  return <draftsContext.Provider value={{ drafts, setDraft: (key, value) => setDrafts((previous) => {
    const next = new Map(previous)
    if (value) next.set(key, { content: value })
    else next.delete(key)
    return next
  }), clearDraft: clear, capture: (key) => {
    const entry = current.current.get(key)
    return { content: entry?.content ?? "", clear: () => clear(key, entry), transfer: (sessionId) => {
      // Keep later edits at either destination while the captured message is sent.
      setDrafts((previous) => {
        const next = new Map(previous)
        const source = previous.get(key)
        if (!next.has(sessionId)) {
          // Edits made during creation become the visible session draft; the captured text still sends.
          const transferred = source ?? entry
          if (transferred) next.set(sessionId, transferred)
          next.delete(key)
        } else if (source === entry) next.delete(key)
        return next
      })
      return () => clear(sessionId, entry)
    } }
  } }}>{children}</draftsContext.Provider>
}

/** Captures a draft version for an operation that can outlive its originating view. */
export function useDraftCapture() {
  const state = useContext(draftsContext)
  if (!state) throw new Error("ConversationDraftProvider is missing")
  return state.capture
}
/** Reads one isolated draft without tying its lifetime to a workspace remount. */
export function useConversationDraft(key: string) {
  const state = useContext(draftsContext)
  if (!state) throw new Error("ConversationDraftProvider is missing")
  const entry = state.drafts.get(key)
  return [entry?.content ?? "", (value: string) => state.setDraft(key, value), () => state.clearDraft(key, entry)] as const
}
