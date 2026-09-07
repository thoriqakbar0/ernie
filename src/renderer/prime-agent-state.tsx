import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react"
import type { PropsWithChildren } from "react"
import { useEvents, useRpc } from "@zenbujs/core/react"
import type {
  PrimeSessionInspection,
  PrimeAgentModelClient,
  PrimeSessionState,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
} from "../packages/prime-agent"
import { createZenbuPrimeAgentClient } from "../packages/prime-agent/zenbu"
import { createPrimeWorkspace } from "../packages/prime-workspace"
import type { AttachedPrimeSession } from "../packages/prime-workspace"

const sessionKeys = {
  recurrentDepth: (sessionId: string) => ["prime-agent", "recurrent-depth", sessionId] as const,
  snapshot: (sessionId: string) => ["prime-agent", "session", sessionId] as const,
  workspacePath: ["app", "workspace-path"] as const,
}

type SessionStateView = Readonly<{ connection?: PrimeSessionState["connection"] }> &
  (
    | Readonly<{
        data: readonly PrimeSessionSummary[]
        isError: false
        isPending: true
        isSuccess: false
        selectedSessionId?: string
      }>
    | Readonly<{
        data: readonly PrimeSessionSummary[]
        error: unknown
        isError: true
        isPending: false
        isSuccess: false
        selectedSessionId?: string
      }>
    | Readonly<{
        data: readonly PrimeSessionSummary[]
        isError: false
        isPending: false
        isSuccess: true
        selectedSessionId?: string
      }>
  )

class PrimeAgentRuntime {
  private readonly workspace
  private readonly attachments = new Map<string, Promise<AttachedPrimeSession>>()
  private readonly stateListeners = new Set<() => void>()
  private stateRevision = -1
  private stateView: SessionStateView = {
    data: [],
    isError: false,
    isPending: true,
    isSuccess: false,
  }
  private unsubscribeState: (() => void) | undefined
  private started = false

  private readonly client: PrimeAgentModelClient & { dispose?: () => void }
  private readonly getWorkspacePath: () => Promise<string>

  constructor(
    client: PrimeAgentModelClient & { dispose?: () => void },
    getWorkspacePath: () => Promise<string>,
  ) {
    this.client = client
    this.getWorkspacePath = getWorkspacePath
    this.workspace = createPrimeWorkspace({
      createId: () => crypto.randomUUID(),
      primeAgent: client,
    })
  }

  start() {
    if (this.started) {
      return
    }
    this.started = true
    this.unsubscribeState = this.client.subscribeSessionState((state) => {
      this.acceptState(state)
    })
    const pendingState = this.client.getSessionState()
    const loadState = async () => {
      let state: PrimeSessionState
      try {
        state = await pendingState
      } catch (error) {
        this.failState(error)
        return
      }
      this.acceptState(state)
    }
    void loadState()
  }

  async connectDaemon() {
    if (!this.client.connectDaemon) {
      return
    }
    try {
      this.acceptState(await this.client.connectDaemon())
    } catch (error) {
      this.failState(error, true)
    }
  }

  getStateView = () => this.stateView

  subscribeState = (listener: () => void) => {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  workspacePath() {
    return this.getWorkspacePath()
  }

  async createSession(initialPrompt?: string) {
    const cwd = await this.getWorkspacePath()
    const attached = await this.workspace.createSession({
      cwd,
      name: "New Prime Agent session",
    })
    this.attachments.set(attached.snapshot.session.id, Promise.resolve(attached))
    let initialPromptError: string | undefined
    if (initialPrompt?.trim()) {
      try {
        const sent = await attached.chat.submitDraft(initialPrompt)
        if (sent.status === "unknown" || sent.status === "not-sent") {
          initialPromptError = sent.message
        }
      } catch (error) {
        initialPromptError = error instanceof Error ? error.message : "Prime Agent command failed"
      }
    }
    return { attached, initialPromptError }
  }

  async getAttachment(sessionId: string) {
    const existing = this.attachments.get(sessionId)
    if (existing) {
      return existing
    }

    const pending = this.workspace.attachSession(sessionId)
    this.attachments.set(sessionId, pending)
    try {
      const attached = await pending
      return attached
    } catch (error) {
      this.attachments.delete(sessionId)
      throw error
    }
  }

  async releaseSend(sessionId: string) {
    const attachment = await this.getAttachment(sessionId)
    attachment.chat.releaseUncertainSend()
  }

  async submit(sessionId: string, content: string) {
    const attachment = await this.getAttachment(sessionId)
    return attachment.snapshot.session.state === "working"
      ? attachment.chat.followUp(content)
      : attachment.chat.submitDraft(content)
  }

  subscribe(sessionId: string, listener: (snapshot: PrimeSessionSnapshot) => void) {
    let active = true
    let unsubscribe: (() => void) | undefined
    const attach = async () => {
      try {
        const attachment = await this.getAttachment(sessionId)
        if (!active) {
          return
        }
        listener(attachment.snapshot)
        unsubscribe = attachment.subscribe(listener)
      } catch {
        // Attachment errors are exposed by the snapshot query.
      }
    }
    void attach()

    return () => {
      active = false
      unsubscribe?.()
    }
  }

  async stop(sessionId: string) {
    const attachment = await this.getAttachment(sessionId)
    await attachment.chat.stop()
  }

  getModels(sessionId: string | undefined, all = false) {
    return this.client.getModels({ all, sessionId })
  }

  setModel(sessionId: string, provider: string, modelId: string) {
    return this.client.setModel({ modelId, provider, sessionId })
  }

  getRecurrentDepth(sessionId: string) {
    return this.client.getRecurrentDepth({ sessionId })
  }

  setEffort(
    sessionId: string,
    effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max",
  ) {
    return this.client.setEffort({ effort, sessionId })
  }

  setRecurrentDepth(sessionId: string, recurrentDepth: number) {
    return this.client.setRecurrentDepth({ recurrentDepth, sessionId })
  }

  selectSession(sessionId: string | undefined) {
    return this.client.selectSession(sessionId ? { sessionId } : {})
  }

  async dispose() {
    const attachments = await Promise.allSettled(this.attachments.values())
    for (const result of attachments) {
      if (result.status === "fulfilled") {
        result.value.dispose()
      }
    }
    this.attachments.clear()
    this.unsubscribeState?.()
    this.unsubscribeState = undefined
    this.stateListeners.clear()
    this.client.dispose?.()
  }

  private acceptState(state: PrimeSessionState) {
    if (state.revision <= this.stateRevision) {
      return
    }
    this.stateRevision = state.revision
    this.stateView = {
      connection: state.connection,
      data: state.sessions,
      isError: false,
      isPending: false,
      isSuccess: true,
      ...(state.selectedSessionId ? { selectedSessionId: state.selectedSessionId } : {}),
    }
    for (const listener of this.stateListeners) {
      listener()
    }
  }

  private failState(error: unknown, force = false) {
    if (!force && this.stateRevision >= 0) {
      return
    }
    this.stateView = {
      connection: this.stateView.connection,
      data: this.stateView.data,
      error,
      isError: true,
      isPending: false,
      isSuccess: false,
    }
    for (const listener of this.stateListeners) {
      listener()
    }
  }
}

const PrimeAgentRuntimeContext = createContext<PrimeAgentRuntime | undefined>(undefined)

const useStableValue = <T,>(createValue: () => T): T => {
  const [value] = useState(createValue)
  return value
}

const PrimeAgentState = ({
  children,
  client,
  getWorkspacePath,
}: PropsWithChildren<{
  client: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath: () => Promise<string>
}>) => {
  const runtime = useStableValue(() => new PrimeAgentRuntime(client, getWorkspacePath))
  const queryClient = useStableValue(
    () =>
      new QueryClient({
        defaultOptions: {
          mutations: { retry: false },
          queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        },
      }),
  )

  useEffect(() => {
    runtime.start()
    return () => {
      void runtime.dispose()
      queryClient.clear()
    }
  }, [queryClient, runtime])

  return (
    <PrimeAgentRuntimeContext value={runtime}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PrimeAgentRuntimeContext>
  )
}

const LivePrimeAgentState = ({ children }: PropsWithChildren) => {
  const rpc = useRpc()
  const events = useEvents()
  const client = useStableValue(() => createZenbuPrimeAgentClient(rpc.app.primeAgent, events.app))

  return (
    <PrimeAgentState client={client} getWorkspacePath={() => rpc.app.cwd.get()}>
      {children}
    </PrimeAgentState>
  )
}

// @lat: [[product#Product contract#Session continuity]]
/** Provides one Prime Agent runtime and one server-state cache to a Zenbu renderer. */
export const PrimeAgentStateProvider = ({
  children,
  client,
  getWorkspacePath,
}: PropsWithChildren<{
  client?: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath?: () => Promise<string>
}>) => {
  if (client && !getWorkspacePath) {
    throw new Error("A workspace path provider is required with a custom Prime Agent client")
  }

  return client && getWorkspacePath ? (
    <PrimeAgentState client={client} getWorkspacePath={getWorkspacePath}>
      {children}
    </PrimeAgentState>
  ) : (
    <LivePrimeAgentState>{children}</LivePrimeAgentState>
  )
}

const usePrimeAgentRuntime = () => {
  const runtime = useContext(PrimeAgentRuntimeContext)
  if (!runtime) {
    throw new Error("PrimeAgentStateProvider is missing")
  }
  return runtime
}

/** Session-explicit commands for application-owned conversation operations. */
export const useConversationCommands = () => {
  const runtime = usePrimeAgentRuntime()
  return useMemo(
    () => ({
      release: (sessionId: string) => runtime.releaseSend(sessionId),
      stop: (sessionId: string) => runtime.stop(sessionId),
      submit: (sessionId: string, content: string) => runtime.submit(sessionId, content),
    }),
    [runtime],
  )
}

/** Reads Prime Agent's authoritative session state from its renderer mirror. */
export const usePrimeSessionState = () => {
  const runtime = usePrimeAgentRuntime()
  return useSyncExternalStore(runtime.subscribeState, runtime.getStateView, runtime.getStateView)
}

/** Requests an explicit connection through the existing runtime owner. */
export const useConnectPrimeDaemon = () => {
  const runtime = usePrimeAgentRuntime()
  return useCallback(() => runtime.connectDaemon(), [runtime])
}

/** Reads the initial workspace path from Ernie's main-process configuration. */
export const useWorkspacePath = () => {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryFn: () => runtime.workspacePath(),
    queryKey: sessionKeys.workspacePath,
  })
}

/** Reads and changes the session displayed by Ernie's shared chat shell. */
export const usePrimeSessionSelection = () => {
  const runtime = usePrimeAgentRuntime()
  const state = usePrimeSessionState()
  const selectSession = useCallback(
    (sessionId: string) => {
      const select = async () => {
        try {
          await runtime.selectSession(sessionId)
        } catch (error) {
          console.error("Failed to select Prime Agent session", error)
        }
      }
      void select()
    },
    [runtime],
  )
  return useMemo(
    () => ({
      selectSession,
      selectedSessionId: state.selectedSessionId,
    }),
    [selectSession, state.selectedSessionId],
  )
}

/** Reads one attached snapshot and applies ordered events to the Query cache. */
export const usePrimeSessionSnapshot = (sessionId: string | undefined) => {
  const runtime = usePrimeAgentRuntime()
  const queryClient = useQueryClient()
  const query = useQuery({
    enabled: sessionId !== undefined,
    queryFn: async () => {
      if (!sessionId) {
        throw new Error("No Prime Agent session is attached")
      }
      const attachment = await runtime.getAttachment(sessionId)
      return attachment.snapshot
    },
    queryKey: sessionKeys.snapshot(sessionId ?? "none"),
  })

  useEffect(() => {
    if (!sessionId) {
      return
    }

    return runtime.subscribe(sessionId, (snapshot) => {
      queryClient.setQueryData(sessionKeys.snapshot(sessionId), snapshot)
    })
  }, [queryClient, runtime, sessionId])

  return query
}

/** Returns commands for the currently attached Prime Agent session. */
export const usePrimeSessionActions = (sessionId: string | undefined) => {
  const runtime = usePrimeAgentRuntime()
  return useMemo(
    () => ({
      setEffort: (effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max") => {
        if (!sessionId) {
          throw new Error("No Prime Agent session is attached")
        }
        return runtime.setEffort(sessionId, effort)
      },
      setModel: (provider: string, modelId: string) => {
        if (!sessionId) {
          throw new Error("No Prime Agent session is attached")
        }
        return runtime.setModel(sessionId, provider, modelId)
      },
      setRecurrentDepth: (recurrentDepth: number) => {
        if (!sessionId) {
          throw new Error("No Prime Agent session is attached")
        }
        return runtime.setRecurrentDepth(sessionId, recurrentDepth)
      },
      stop: () => {
        if (!sessionId) {
          throw new Error("No Prime Agent session is attached")
        }
        return runtime.stop(sessionId)
      },
      submit: (content: string) => {
        if (!sessionId) {
          throw new Error("No Prime Agent session is attached")
        }
        return runtime.submit(sessionId, content)
      },
    }),
    [runtime, sessionId],
  )
}

/** Reads the model catalog owned by the attached Prime Agent session. */
export const usePrimeModels = (sessionId?: string, all = false) => {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryFn: () => runtime.getModels(sessionId, all),
    queryKey: ["prime-agent", "models", sessionId ?? "none", all],
  })
}

/** Read-only inspection keeps the selected root and its draft attached. */
export const useNativeInspection = (
  parentId: string,
  target: { kind: "child" | "saved"; id: string },
) => {
  const rpc = useRpc()
  return useQuery({
    queryFn: async (): Promise<PrimeSessionInspection> => {
      if (target.kind === "child") {
        return rpc.app.primeAgent.inspectChild({ childId: target.id, parentSessionId: parentId })
      }
      const { snapshot } = await rpc.app.primeAgent.attachSession({ sessionId: target.id })
      return {
        messages: snapshot.messages,
        name: snapshot.session.name,
        sessionId: snapshot.session.id,
        snapshot,
        source: "live",
      }
    },
    queryKey: ["native-inspection", parentId, target.kind, target.id],
    refetchInterval: 2000,
    retry: false,
  })
}
