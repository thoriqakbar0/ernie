import { annotatedMessage } from "./response-annotation"
import type { ResponseAnnotation } from "./response-annotation"
import {
  useCallback,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ContextType, PropsWithChildren } from "react"
import { useDb, useRpc } from "@zenbujs/core/react"
import { Effect, Option, Schema } from "effect"
import { AgentFailure, Roster, emptyRoster } from "../packages/agents"
import type { AgentResult } from "../packages/agents"
import { usePrimeSessionState } from "./prime-agent-state"
import type { AgentsService } from "../main/services/agents"

/** Narrow client seam shared by live UI and isolated development scenarios. */
export type AgentClient = Pick<
  AgentsService,
  | "save"
  | "pin"
  | "select"
  | "assign"
  | "openConversation"
  | "createConversation"
  | "chooseWorkspace"
  | "bindRoot"
>
type AgentContext = Readonly<{
  roster: Roster
  client: AgentClient
  error: string | undefined
  pending: number
  reconnect: (agentId: string, retry?: boolean) => Promise<AgentResult<unknown>>
  execute: <A>(operation: () => Promise<AgentResult<A>>) => Promise<AgentResult<A>>
}>
const context = createContext<AgentContext | undefined>(undefined)

const AgentState = ({
  children,
  roster,
  client,
  readError,
}: PropsWithChildren<{ roster: Roster; client: AgentClient; readError?: string }>) => {
  const native = usePrimeSessionState()
  const connection = useRef(native)
  useLayoutEffect(() => {
    connection.current = native
  }, [native])
  const reconnects = useRef(
    new Map<string, { generation: number; result: Promise<AgentResult<unknown>> }>(),
  )
  const [actionError, setActionError] = useState<{ message: string; generation?: number }>()
  const [pending, setPending] = useState(0)
  const execute = useCallback(
    async <A,>(operation: () => Promise<AgentResult<A>>): Promise<AgentResult<A>> => {
      const started = connection.current
      setPending((count) => count + 1)
      setActionError(undefined)
      const result = await Effect.runPromise(
        Effect.tryPromise({
          catch: (cause) =>
            new AgentFailure({
              cause,
              message: "Ernie could not save this action. Your input is kept; try again.",
            }),
          try: operation,
        }).pipe(
          Effect.catch((error) => Effect.succeed({ error: error.message, ok: false as const })),
        ),
      )
      setPending((count) => count - 1)
      if (!result.ok) {
        setActionError({
          message: result.error,
          ...("reason" in result && result.reason === "connection"
            ? { generation: started.connectionGeneration }
            : {}),
        })
      }
      return result
    },
    [],
  )
  const reconnect = useCallback(
    (agentId: string, retry = false) => {
      const previous = reconnects.current.get(agentId)
      const generation = connection.current.connectionGeneration
      if (previous && previous.generation === generation && !retry) {
        return previous.result
      }
      const attempt = execute(() => client.select({ agentId }))
      reconnects.current.set(agentId, { generation, result: attempt })
      return attempt
    },
    [client, execute],
  )
  const recoveredError =
    actionError?.generation !== undefined &&
    native.connection?.state.status === "connected" &&
    native.connectionGeneration > actionError.generation
  const visibleError = recoveredError ? undefined : actionError?.message
  const value = useMemo(
    () => ({ client, error: readError ?? visibleError, execute, pending, reconnect, roster }),
    [client, readError, visibleError, execute, pending, reconnect, roster],
  )
  return <context.Provider value={value}>{children}</context.Provider>
}
const LiveAgentState = ({ children }: PropsWithChildren) => {
  const rpc = useRpc()
  const client = useMemo<AgentClient>(
    () => ({
      assign: (input) => rpc.app.agents.assign(input),
      bindRoot: (input) => rpc.app.agents.bindRoot(input),
      chooseWorkspace: () => rpc.app.agents.chooseWorkspace(),
      createConversation: (input) => rpc.app.agents.createConversation(input),
      openConversation: (input) => rpc.app.agents.openConversation(input),
      pin: (input) => rpc.app.agents.pin(input),
      save: (input) => rpc.app.agents.save(input),
      select: (input) => rpc.app.agents.select(input),
    }),
    [rpc],
  )
  const native = usePrimeSessionState()
  const raw = useDb((root) => root.app?.roster)
  const roster = useMemo(
    () => Option.getOrUndefined(Schema.decodeUnknownOption(Roster)(raw)),
    [raw],
  )
  const presented = useMemo(
    () =>
      roster
        ? {
            ...roster,
            agents: roster.agents.map((agent) => {
              const root = native.data.find((session) => session.id === agent.root?.sessionId)
              return root ? { ...agent, name: root.name ?? agent.name } : agent
            }),
          }
        : emptyRoster,
    [roster, native.data],
  )
  return (
    <AgentState
      roster={presented}
      client={client}
      readError={
        raw !== undefined && !roster ? "The saved Agent roster could not be read." : undefined
      }
    >
      {children}
    </AgentState>
  )
}
/** Owns roster commands and feedback; Zenbu remains the persisted state authority. */
export const AgentStateProvider = ({
  children,
  roster,
  client,
}: PropsWithChildren<{ roster?: Roster; client?: AgentClient }>) =>
  roster && client ? (
    <AgentState roster={roster} client={client}>
      {children}
    </AgentState>
  ) : (
    <LiveAgentState>{children}</LiveAgentState>
  )
/** Reads the roster and its owned command boundary. */
export const useAgents = () => {
  const state = useContext(context)
  if (!state) {
    throw new Error("AgentStateProvider is missing")
  }
  return state
}

type DraftEntry = Readonly<{ content: string; annotations: readonly ResponseAnnotation[] }>
const draftsContext = createContext<
  | {
      drafts: ReadonlyMap<string, DraftEntry>
      setDraft: (key: string, value: string) => void
      updateAnnotations: (
        key: string,
        update: (previous: readonly ResponseAnnotation[]) => readonly ResponseAnnotation[],
      ) => void
      clearDraft: (key: string, expected: DraftEntry | undefined) => void
      capture: (key: string) => {
        content: string
        clear: () => void
        transfer: (sessionId: string) => () => void
      }
    }
  | undefined
>(undefined)
/** Retains unsent text by session (or empty Agent) for this application lifetime. */
export const ConversationDraftProvider = ({ children }: PropsWithChildren) => {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, DraftEntry>>(() => new Map())
  const current = useRef(drafts)
  useLayoutEffect(() => {
    current.current = drafts
  }, [drafts])
  const clear = useCallback(
    (key: string, expected: DraftEntry | undefined) =>
      setDrafts((previous) => {
        if (previous.get(key) !== expected) {
          return previous
        }
        const next = new Map(previous)
        next.delete(key)
        return next
      }),
    [],
  )
  const updateAnnotations = useCallback(
    (
      key: string,
      update: (previous: readonly ResponseAnnotation[]) => readonly ResponseAnnotation[],
    ) =>
      setDrafts((previous) => {
        const next = new Map(previous)
        const content = previous.get(key)?.content ?? ""
        const annotations = update(previous.get(key)?.annotations ?? [])
        if (content || annotations.length) {
          next.set(key, { annotations, content })
        } else {
          next.delete(key)
        }
        return next
      }),
    [],
  )
  const draftValue = useMemo<NonNullable<ContextType<typeof draftsContext>>>(
    () => ({
      capture: (key) => {
        const entry = current.current.get(key)
        return {
          clear: () => clear(key, entry),
          content: annotatedMessage(entry?.content ?? "", entry?.annotations ?? []),
          transfer: (sessionId) => {
            // Keep later edits at either destination while the captured message is sent.
            setDrafts((previous) => {
              const next = new Map(previous)
              const source = previous.get(key)
              if (!next.has(sessionId)) {
                // Edits made during creation become the visible session draft; the captured text still sends.
                const transferred = source ?? entry
                if (transferred) {
                  next.set(sessionId, transferred)
                }
                next.delete(key)
              } else if (source === entry) {
                next.delete(key)
              }
              return next
            })
            return () => clear(sessionId, entry)
          },
        }
      },
      clearDraft: clear,
      drafts,
      setDraft: (key, value) =>
        setDrafts((previous) => {
          const next = new Map(previous)
          const annotations = previous.get(key)?.annotations ?? []
          if (value || annotations.length) {
            next.set(key, { annotations, content: value })
          } else {
            next.delete(key)
          }
          return next
        }),
      updateAnnotations,
    }),
    [clear, drafts, updateAnnotations],
  )
  return <draftsContext.Provider value={draftValue}>{children}</draftsContext.Provider>
}

/** Captures a draft version for an operation that can outlive its originating view. */
export const useDraftCapture = () => {
  const state = useContext(draftsContext)
  if (!state) {
    throw new Error("ConversationDraftProvider is missing")
  }
  return state.capture
}
/** Reads one isolated draft without tying its lifetime to a workspace remount. */
export const useConversationDraft = (key: string) => {
  const state = useContext(draftsContext)
  if (!state) {
    throw new Error("ConversationDraftProvider is missing")
  }
  const entry = state.drafts.get(key)
  return [
    entry?.content ?? "",
    (value: string) => state.setDraft(key, value),
    () => state.clearDraft(key, entry),
  ] as const
}

/** Keeps response feedback in the same versioned draft as the message text. */
export const useResponseAnnotations = (key: string) => {
  const state = useContext(draftsContext)
  if (!state) {
    throw new Error("ConversationDraftProvider is missing")
  }
  const update = state.updateAnnotations
  const add = useCallback(
    (annotation: ResponseAnnotation) => update(key, (previous) => [...previous, annotation]),
    [key, update],
  )
  return {
    add,
    annotations: state.drafts.get(key)?.annotations ?? [],
    remove: (id: string) =>
      state.updateAnnotations(key, (previous) => previous.filter((item) => item.id !== id)),
  }
}

/** Seeds an editable conversation draft without dispatching a message. */
export const useSetConversationDraft = () => {
  const state = useContext(draftsContext)
  if (!state) {
    throw new Error("ConversationDraftProvider is missing")
  }
  return state.setDraft
}
