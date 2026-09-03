import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import type { PropsWithChildren } from "react"
import { useEvents, useRpc } from "@zenbujs/core/react"
import { Option, Schema } from "effect"
import type { PrimeAgentModelClient, PrimeSessionSnapshot } from "../packages/prime-agent"
import { createZenbuPrimeAgentClient } from "../packages/prime-agent/zenbu"
import {
  createPrimeWorkspace,
  type AttachedPrimeSession,
} from "../packages/prime-workspace"

const sessionKeys = {
  all: ["prime-agent", "sessions"] as const,
  snapshot: (sessionId: string) => ["prime-agent", "session", sessionId] as const,
  workspacePath: ["app", "workspace-path"] as const,
}

const sessionSelectionSchema = Schema.Struct({ sessionId: Schema.optional(Schema.NonEmptyString) })
const SESSION_LIST_REFRESH_MS = 1_000

class PrimeAgentRuntime {
  private readonly workspace
  private readonly attachments = new Map<string, Promise<AttachedPrimeSession>>()
  private readonly resolvedAttachments = new Map<string, AttachedPrimeSession>()

  constructor(
    private readonly client: PrimeAgentModelClient & { dispose?: () => void },
    private readonly getWorkspacePath: () => Promise<string>,
  ) {
    this.workspace = createPrimeWorkspace({
      primeAgent: client,
      createId: () => crypto.randomUUID(),
    })
  }

  listSessions() {
    return this.workspace.listSessions()
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
    this.resolvedAttachments.set(attached.snapshot.session.id, attached)
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
      this.resolvedAttachments.set(sessionId, attached)
      return attached
    } catch (error) {
      this.attachments.delete(sessionId)
      throw error
    }
  }

  getAttachedSnapshot(sessionId: string) {
    return this.resolvedAttachments.get(sessionId)?.snapshot
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

  async dispose() {
    const attachments = await Promise.allSettled(this.attachments.values())
    for (const result of attachments) {
      if (result.status === "fulfilled") result.value.dispose()
    }
    this.attachments.clear()
    this.resolvedAttachments.clear()
    this.client.dispose?.()
  }
}

const PrimeAgentRuntimeContext = createContext<PrimeAgentRuntime | undefined>(undefined)

export type PrimeSessionSelectionChannel = Readonly<{
  get(): Promise<string | undefined>
  select(sessionId: string | undefined): Promise<void>
  subscribe(listener: (sessionId: string | undefined) => void): () => void
}>

type PrimeSessionSelection = Readonly<{
  selectedSessionId: string | undefined
  selectSession: (sessionId: string) => void
}>

const PrimeSessionSelectionContext = createContext<PrimeSessionSelection | undefined>(undefined)

// @lat: [[product#Product contract#Session continuity]]
/** Provides one Prime Agent runtime and one server-state cache to a Zenbu renderer. */
export function PrimeAgentStateProvider({
  children,
  client,
  getWorkspacePath,
  selectionChannel,
}: PropsWithChildren<{
  client?: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath?: () => Promise<string>
  selectionChannel?: PrimeSessionSelectionChannel
}>) {
  if (client && !getWorkspacePath) {
    throw new Error("A workspace path provider is required with a custom Prime Agent client")
  }

  return client
    ? (
        <PrimeAgentState
          client={client}
          getWorkspacePath={getWorkspacePath!}
          selectionChannel={selectionChannel}
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
  const [selectionChannel] = useState<PrimeSessionSelectionChannel>(() => ({
    get: () => rpc.app.sessionSelection.get(),
    select: (sessionId) => sessionId
      ? rpc.app.sessionSelection.select({ sessionId })
      : rpc.app.sessionSelection.clear(),
    subscribe: (listener) => events.app.primeSessionSelected.subscribe((input) => {
      const parsed = Schema.decodeUnknownOption(sessionSelectionSchema)(input)
      if (Option.isSome(parsed)) listener(parsed.value.sessionId)
    }),
  }))

  return (
    <PrimeAgentState
      client={client}
      getWorkspacePath={() => rpc.app.cwd.get()}
      selectionChannel={selectionChannel}
    >
      {children}
    </PrimeAgentState>
  )
}

function PrimeAgentState({
  children,
  client,
  getWorkspacePath,
  selectionChannel,
}: PropsWithChildren<{
  client: PrimeAgentModelClient & { dispose?: () => void }
  getWorkspacePath: () => Promise<string>
  selectionChannel?: PrimeSessionSelectionChannel
}>) {
  const [runtime] = useState(() => new PrimeAgentRuntime(client, getWorkspacePath))
  const [selection] = useState(() => selectionChannel ?? createLocalSelectionChannel())
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
      mutations: { retry: false },
    },
  }))

  useEffect(() => () => {
    void runtime.dispose()
    queryClient.clear()
  }, [queryClient, runtime])

  return (
    <PrimeAgentRuntimeContext value={runtime}>
      <QueryClientProvider client={queryClient}>
        <PrimeSessionSelectionProvider channel={selection}>
          {children}
        </PrimeSessionSelectionProvider>
      </QueryClientProvider>
    </PrimeAgentRuntimeContext>
  )
}

function usePrimeAgentRuntime() {
  const runtime = useContext(PrimeAgentRuntimeContext)
  if (!runtime) throw new Error("PrimeAgentStateProvider is missing")
  return runtime
}

/** Reads Prime Agent's session list from the Query cache. */
export function usePrimeSessions() {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryKey: sessionKeys.all,
    queryFn: () => runtime.listSessions(),
    refetchInterval: SESSION_LIST_REFRESH_MS,
    refetchIntervalInBackground: true,
  })
}

/** Reads the initial workspace path from Ernie's main-process configuration. */
export function useWorkspacePath() {
  const runtime = usePrimeAgentRuntime()
  return useQuery({
    queryKey: sessionKeys.workspacePath,
    queryFn: () => runtime.workspacePath(),
  })
}

function PrimeSessionSelectionProvider({
  channel,
  children,
}: PropsWithChildren<{ channel: PrimeSessionSelectionChannel }>) {
  const runtime = usePrimeAgentRuntime()
  const queryClient = useQueryClient()
  const sessions = usePrimeSessions()
  const [selectedSessionId, setSelectedSessionId] = useState<string>()
  const selectionRevision = useRef(0)

  const acceptSelection = useCallback((sessionId: string | undefined) => {
    selectionRevision.current += 1
    setSelectedSessionId(sessionId)
    if (!sessionId) return

    const revision = selectionRevision.current
    void runtime.getAttachment(sessionId).then((attached) => {
      if (selectionRevision.current !== revision) return
      const session = attached.snapshot.session
      queryClient.setQueryData(sessionKeys.snapshot(sessionId), attached.snapshot)
      queryClient.setQueryData(
        sessionKeys.all,
        (sessions: readonly PrimeSessionSnapshot["session"][] | undefined) => {
          if (!sessions?.some(({ id }) => id === session.id)) {
            return [...(sessions ?? []), session]
          }
          return sessions.map((existing) => existing.id === session.id ? session : existing)
        },
      )
    }).catch((error: unknown) => {
      if (selectionRevision.current === revision) {
        console.error("Failed to synchronize Prime Agent session selection", error)
      }
    })
  }, [queryClient, runtime])

  useEffect(() => {
    const unsubscribe = channel.subscribe(acceptSelection)
    return () => {
      selectionRevision.current += 1
      unsubscribe()
    }
  }, [acceptSelection, channel])

  useEffect(() => {
    if (!sessions.isSuccess) return

    let active = true
    const revision = selectionRevision.current
    void channel.get().then((current) => {
      if (!active || selectionRevision.current !== revision) return
      const availableSessionIds = sessions.data.map(({ id }) => id)
      if (current && availableSessionIds.includes(current)) {
        if (current === selectedSessionId) return
        logSessionSelection("keep", current, availableSessionIds)
        acceptSelection(current)
        return
      }

      const firstSessionId = sessions.data[0]?.id
      logSessionSelection(current ? "replace-stale" : "initialize", current, availableSessionIds)
      return channel.select(firstSessionId)
    }).catch((error: unknown) => {
      if (active && selectionRevision.current === revision) {
        console.error("Failed to initialize Prime Agent session selection", error)
      }
    })

    return () => {
      active = false
    }
  }, [acceptSelection, channel, selectedSessionId, sessions.data, sessions.isSuccess])

  const selectSession = useCallback((sessionId: string) => {
    selectionRevision.current += 1
    const snapshot = runtime.getAttachedSnapshot(sessionId)
    if (snapshot) queryClient.setQueryData(sessionKeys.snapshot(sessionId), snapshot)
    setSelectedSessionId(sessionId)
    void channel.select(sessionId).catch((error: unknown) => {
      console.error("Failed to select Prime Agent session", error)
    })
  }, [channel, queryClient, runtime])

  const selection = useMemo(() => ({
    selectedSessionId,
    selectSession,
  }), [selectSession, selectedSessionId])

  return (
    <PrimeSessionSelectionContext value={selection}>
      {children}
    </PrimeSessionSelectionContext>
  )
}

function createLocalSelectionChannel(): PrimeSessionSelectionChannel {
  const listeners = new Set<(sessionId: string | undefined) => void>()
  let selectedSessionId: string | undefined

  return {
    get: async () => selectedSessionId,
    select: async (sessionId) => {
      if (sessionId === selectedSessionId) return
      selectedSessionId = sessionId
      for (const listener of listeners) listener(sessionId)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function logSessionSelection(
  action: "initialize" | "keep" | "replace-stale",
  requestedSessionId: string | undefined,
  availableSessionIds: readonly string[],
) {
  if (!import.meta.env.DEV) return
  console.info("[ernie:prime-agent] session selection", {
    action,
    requestedSessionId,
    availableSessionIds,
  })
}

/** Reads and changes the session displayed by Ernie's shared chat shell. */
export function usePrimeSessionSelection() {
  const selection = useContext(PrimeSessionSelectionContext)
  if (!selection) throw new Error("PrimeSessionSelectionProvider is missing")
  return selection
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
      queryClient.setQueryData(
        sessionKeys.all,
        (sessions: readonly PrimeSessionSnapshot["session"][] | undefined) =>
          sessions?.map((session) =>
            session.id === snapshot.session.id ? snapshot.session : session,
          ),
      )
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

/** Creates a Prime Agent session and seeds both session Query caches. */
export function useCreatePrimeSession() {
  const runtime = usePrimeAgentRuntime()
  const queryClient = useQueryClient()
  const { selectSession } = usePrimeSessionSelection()
  return useMutation({
    mutationFn: (initialPrompt?: string) => runtime.createSession(initialPrompt),
    onSuccess: ({ attached }) => {
      queryClient.setQueryData(
        sessionKeys.all,
        (sessions: readonly PrimeSessionSnapshot["session"][] | undefined) => [
          ...(sessions ?? []),
          attached.snapshot.session,
        ],
      )
      queryClient.setQueryData(
        sessionKeys.snapshot(attached.snapshot.session.id),
        attached.snapshot,
      )
      selectSession(attached.snapshot.session.id)
    },
  })
}
