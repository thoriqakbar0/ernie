import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { PropsWithChildren } from "react"
import { useEvents, useRpc } from "@zenbujs/core/react"
import type {
  PrimeAgentModelClient,
  PrimeSessionState,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
} from "../packages/prime-agent"
import { createZenbuPrimeAgentClient } from "../packages/prime-agent/zenbu"
import {
  createPrimeWorkspace,
  type AttachedPrimeSession,
} from "../packages/prime-workspace"

const sessionKeys = {
  snapshot: (sessionId: string) => ["prime-agent", "session", sessionId] as const,
  workspacePath: ["app", "workspace-path"] as const,
}

type SessionStateView =
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

  constructor(
    private readonly client: PrimeAgentModelClient & { dispose?: () => void },
    private readonly getWorkspacePath: () => Promise<string>,
  ) {
    this.workspace = createPrimeWorkspace({
      primeAgent: client,
      createId: () => crypto.randomUUID(),
    })
  }

  start() {
    if (this.started) return
    this.started = true
    this.unsubscribeState = this.client.subscribeSessionState((state) => {
      this.acceptState(state)
    })
    void this.client.getSessionState().then(
      (state) => this.acceptState(state),
      (error: unknown) => this.failState(error),
    )
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
        await attached.chat.submitDraft(initialPrompt)
      } catch (cause) {
        initialPromptError = cause instanceof Error ? cause.message : "Prime Agent command failed"
      }
    }
    return { attached, initialPromptError }
  }

  async getAttachment(sessionId: string) {
    const existing = this.attachments.get(sessionId)
    if (existing) return existing

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

  async submit(sessionId: string, content: string) {
    const attachment = await this.getAttachment(sessionId)
    return attachment.snapshot.session.state === "working"
      ? attachment.chat.followUp(content)
      : attachment.chat.submitDraft(content)
  }

  subscribe(sessionId: string, listener: (snapshot: PrimeSessionSnapshot) => void) {
    let active = true
    let unsubscribe = () => {}
    void this.getAttachment(sessionId).then((attachment) => {
      if (!active) return
      listener(attachment.snapshot)
      unsubscribe = attachment.subscribe(listener)
    }).catch(() => undefined)

    return () => {
      active = false
      unsubscribe()
    }
  }

  async stop(sessionId: string) {
    const attachment = await this.getAttachment(sessionId)
    await attachment.chat.stop()
  }

  getModels(sessionId: string) {
    return this.client.getModels({ sessionId })
  }

  setModel(sessionId: string, provider: string, modelId: string) {
    return this.client.setModel({ sessionId, provider, modelId })
  }

  selectSession(sessionId: string | undefined) {
    return this.client.selectSession(sessionId ? { sessionId } : {})
  }

  async dispose() {
    const attachments = await Promise.allSettled(this.attachments.values())
    for (const result of attachments) {
      if (result.status === "fulfilled") result.value.dispose()
    }
    this.attachments.clear()
    this.unsubscribeState?.()
    this.unsubscribeState = undefined
    this.stateListeners.clear()
    this.client.dispose?.()
  }

  private acceptState(state: PrimeSessionState) {
    if (state.revision <= this.stateRevision) return
    this.stateRevision = state.revision
    this.stateView = {
      data: state.sessions,
      isError: false,
      isPending: false,
      isSuccess: true,
      ...(state.selectedSessionId ? { selectedSessionId: state.selectedSessionId } : {}),
    }
    for (const listener of this.stateListeners) listener()
  }

  private failState(error: unknown) {
    if (this.stateRevision >= 0) return
    this.stateView = {
      data: this.stateView.data,
      error,
      isError: true,
      isPending: false,
      isSuccess: false,
    }
    for (const listener of this.stateListeners) listener()
  }
}

const PrimeAgentRuntimeContext = createContext<PrimeAgentRuntime | undefined>(undefined)

// @lat: [[product#Product contract#Session continuity]]
/** Provides one Prime Agent runtime and one server-state cache to a Zenbu renderer. */
export function PrimeAgentStateProvider({
  children,
  client,
  getWorkspacePath,
}: PropsWithChildren<{
  client?: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath?: () => Promise<string>
}>) {
  if (client && !getWorkspacePath) {
    throw new Error("A workspace path provider is required with a custom Prime Agent client")
  }

  return client
    ? (
        <PrimeAgentState
          client={client}
          getWorkspacePath={getWorkspacePath!}
        >
          {children}
        </PrimeAgentState>
      )
    : <LivePrimeAgentState>{children}</LivePrimeAgentState>
}

function LivePrimeAgentState({ children }: PropsWithChildren) {
  const rpc = useRpc()
  const events = useEvents()
  const [client] = useState(() => createZenbuPrimeAgentClient(
    rpc.app.primeAgent,
    events.app,
  ))

  return (
    <PrimeAgentState
      client={client}
      getWorkspacePath={() => rpc.app.cwd.get()}
    >
      {children}
    </PrimeAgentState>
  )
}

function PrimeAgentState({
  children,
  client,
  getWorkspacePath,
}: PropsWithChildren<{
  client: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath: () => Promise<string>
}>) {
  const [runtime] = useState(() => new PrimeAgentRuntime(client, getWorkspacePath))
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { retry: false },
    },
  }))

  useEffect(() => {
    runtime.start()
    return () => {
      void runtime.dispose()
      queryClient.clear()
    }
  }, [queryClient, runtime])

  return (
    <PrimeAgentRuntimeContext value={runtime}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </PrimeAgentRuntimeContext>
  )
}

function usePrimeAgentRuntime() {
  const runtime = useContext(PrimeAgentRuntimeContext)
  if (!runtime) throw new Error("PrimeAgentStateProvider is missing")
  return runtime
}

/** Reads Prime Agent's authoritative session state from its renderer mirror. */
export function usePrimeSessionState() {
  const runtime = usePrimeAgentRuntime()
  return useSyncExternalStore(
    runtime.subscribeState,
    runtime.getStateView,
    runtime.getStateView,
  )
}

/** Reads the initial workspace path from Ernie's main-process configuration. */
export function useWorkspacePath() {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryKey: sessionKeys.workspacePath,
    queryFn: () => runtime.workspacePath(),
  })
}

/** Reads and changes the session displayed by Ernie's shared chat shell. */
export function usePrimeSessionSelection() {
  const runtime = usePrimeAgentRuntime()
  const state = usePrimeSessionState()
  const selectSession = useCallback((sessionId: string) => {
    void runtime.selectSession(sessionId).catch((error: unknown) => {
      console.error("Failed to select Prime Agent session", error)
    })
  }, [runtime])
  return useMemo(() => ({
    selectedSessionId: state.selectedSessionId,
    selectSession,
  }), [selectSession, state.selectedSessionId])
}

/** Reads one attached snapshot and applies ordered events to the Query cache. */
export function usePrimeSessionSnapshot(sessionId: string | undefined) {
  const runtime = usePrimeAgentRuntime()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: sessionKeys.snapshot(sessionId ?? "none"),
    queryFn: async () => {
      if (!sessionId) throw new Error("No Prime Agent session is attached")
      return (await runtime.getAttachment(sessionId)).snapshot
    },
    enabled: sessionId !== undefined,
  })

  useEffect(() => {
    if (!sessionId) return

    return runtime.subscribe(sessionId, (snapshot) => {
      queryClient.setQueryData(sessionKeys.snapshot(sessionId), snapshot)
    })
  }, [queryClient, runtime, sessionId])

  return query
}

/** Returns commands for the currently attached Prime Agent session. */
export function usePrimeSessionActions(sessionId: string | undefined) {
  const runtime = usePrimeAgentRuntime()
  return useMemo(() => ({
    submit: (content: string) => {
      if (!sessionId) throw new Error("No Prime Agent session is attached")
      return runtime.submit(sessionId, content)
    },
    stop: () => {
      if (!sessionId) throw new Error("No Prime Agent session is attached")
      return runtime.stop(sessionId)
    },
    setModel: (provider: string, modelId: string) => {
      if (!sessionId) throw new Error("No Prime Agent session is attached")
      return runtime.setModel(sessionId, provider, modelId)
    },
  }), [runtime, sessionId])
}

/** Reads the model catalog owned by the attached Prime Agent session. */
export function usePrimeModels(sessionId: string | undefined) {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryKey: ["prime-agent", "models", sessionId ?? "none"],
    queryFn: () => {
      if (!sessionId) throw new Error("No Prime Agent session is attached")
      return runtime.getModels(sessionId)
    },
    enabled: sessionId !== undefined,
  })
}

/** Creates a Prime Agent session and seeds its attached snapshot cache. */
export function useCreatePrimeSession() {
  const runtime = usePrimeAgentRuntime()
  const queryClient = useQueryClient()
  const { selectSession } = usePrimeSessionSelection()
  return useMutation({
    mutationFn: (initialPrompt?: string) => runtime.createSession(initialPrompt),
    onSuccess: ({ attached }) => {
      queryClient.setQueryData(
        sessionKeys.snapshot(attached.snapshot.session.id),
        attached.snapshot,
      )
      selectSession(attached.snapshot.session.id)
    },
  })
}
