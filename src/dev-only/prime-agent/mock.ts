import type {
  SendRequest,
  SendReceipt,
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeAgentModelClient,
  PrimeSessionChange,
  PrimeSessionState,
  PrimeSessionEventListener,
  PrimeSessionMessage,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionSummary,
  PrimeSessionTransport,
  PrimeUsefulSessionContext,
  SessionAction,
} from "../../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"

/** Prime Agent mock used by Ernie's local interactive preview. */
export interface MockPrimeAgentClient extends PrimeAgentModelClient {
  /** Releases timers, listeners, and pending idle waits. */
  dispose(): void
}

type MockSession = {
  summary: PrimeSessionSummary
  useful?: PrimeUsefulSessionContext
  followUps: string[]
  messages: PrimeSessionMessage[]
  transport: PrimeSessionTransport
  generation: string
  revision: number
  readonly listeners: Set<PrimeSessionEventListener>
  readonly timers: Set<ReturnType<typeof setTimeout>>
  readonly idleWaiters: Set<() => void>
}

const initialSession: MockSession = {
  followUps: [],
  summary: {
    id: "mock-session-1",
    cwd: "/Users/thor/work/ernie",
    name: "Build the chat workspace",
    lifecycle: "live",
    state: "idle",
    model: { id: "gpt-5", provider: "openai", label: "GPT-5" },
  },
  messages: [
    {
      id: "mock-assistant-1",
      role: "assistant",
      content: "I’m the local Prime Agent mock. Send a message and I’ll exercise Ernie’s real session boundary.",
    },
  ],
  transport: { status: "connected" },
  generation: "mock-generation-1",
  revision: 1,
  listeners: new Set(),
  timers: new Set(),
  idleWaiters: new Set(),
}

/** Selects the authoritative snapshots available when a mock client starts. */
export type MockPrimeAgentClientOptions = Readonly<{
  initialSnapshots?: readonly PrimeSessionSnapshot[]
  beforePrompt?: () => Promise<void>
  afterSend?: () => Promise<void>
  replyDelayMs?: number
}>

/** Creates an in-memory Prime Agent whose sessions retain independent state. */
export function createMockPrimeAgentClient(
  options: MockPrimeAgentClientOptions = {},
): MockPrimeAgentClient {
  const seededSessions = options.initialSnapshots === undefined
    ? [cloneSession(initialSession)]
    : options.initialSnapshots.map(createSeededSession)
  const sessions = new Map<string, MockSession>(
    seededSessions.map((session) => [session.summary.id, session]),
  )
  const sendEpoch = crypto.randomUUID()
  const receipts = new Map<string, { request: SendRequest; result: Promise<SendReceipt> }>()
  const stateListeners = new Set<(state: PrimeSessionState) => void>()
  let stateRevision = 0
  let selectedSessionId: string | undefined = seededSessions[0]?.summary.id

  const state = (): PrimeSessionState => ({
    revision: stateRevision,
    ...(selectedSessionId ? { selectedSessionId } : {}),
    sessions: [...sessions.values()].map(({ summary }) => summary),
  })

  const emitState = () => {
    stateRevision += 1
    const next = state()
    for (const listener of stateListeners) listener(next)
  }

  const getSession = (sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) throw new Error(`Unknown mock Prime Agent session: ${sessionId}`)
    return session
  }

  const emitChange = (
    session: MockSession,
    change: PrimeSessionChange,
  ) => {
    session.revision += 1
    for (const listener of session.listeners) {
      listener({
        type: "change",
        envelope: {
          sessionId: session.summary.id,
          generation: session.generation,
          revision: session.revision,
          change,
        },
      })
    }
  }

  const usefulSnapshot = (session: MockSession): PrimeUsefulSessionContext => {
    const fixture = createPrimeUsefulSessionFixture(session.summary, session.messages)
    return { ...fixture, structuredMessages: [...(session.useful?.structuredMessages.filter((message) => message.role === "toolResult") ?? []), ...fixture.structuredMessages],
      state: { ...fixture.state, activeToolNames: session.summary.state === "working" ? session.useful?.state.activeToolNames ?? [] : [],
        sessionActions: { ...fixture.state.sessionActions, queuedCount: session.followUps.length, followUps: [...session.followUps] } } }
  }
  const emitUsefulState = (session: MockSession) => {
    const useful = usefulSnapshot(session)
    emitChange(session, { type: "usefulState", state: useful.state })
  }

  const emitStructuredMessages = (session: MockSession) => {
    const useful = usefulSnapshot(session)
    emitChange(session, {
      type: "structured",
      structuredMessages: useful.structuredMessages,
    })
  }

  const setState = (session: MockSession, state: PrimeSessionSummary["state"]) => {
    session.summary = { ...session.summary, state }
    emitChange(session, { type: "session", session: session.summary })
    emitState()
    emitUsefulState(session)
    if (state === "idle") {
      for (const resolve of session.idleWaiters) resolve()
      session.idleWaiters.clear()
    }
  }

  const appendMessage = (
    session: MockSession,
    role: PrimeSessionMessage["role"],
    content: string,
  ) => {
    if (role === "user" && session.summary.lifecycle === "draft") {
      session.summary = { ...session.summary, lifecycle: "live" }
      emitChange(session, { type: "session", session: session.summary })
    }
    const message = {
      id: `${session.summary.id}-message-${session.revision + 1}`,
      role,
      content,
    }
    session.messages = [...session.messages, message]
    emitChange(session, { type: "message", message })
    emitStructuredMessages(session)
    emitUsefulState(session)
  }

  const scheduleReply = (session: MockSession, content: string) => {
    const timer = setTimeout(() => {
      session.timers.delete(timer)
      appendMessage(session, "assistant", `Mock Prime Agent received: ${content}`)
      const next = session.followUps.shift()
      if (next) { appendMessage(session, "user", next); scheduleReply(session, next) }
      else setState(session, "idle")
    }, options.replyDelayMs ?? 450)
    session.timers.add(timer)
  }

  const snapshot = (session: MockSession): PrimeSessionSnapshot => ({
    session: session.summary,
    messages: session.messages,
    useful: usefulSnapshot(session),
    transport: session.transport,
  })

  const snapshotEnvelope = (session: MockSession): PrimeSessionSnapshotEnvelope => ({
    sessionId: session.summary.id,
    generation: session.generation,
    revision: session.revision,
    snapshot: snapshot(session),
  })

  return {
    getSendEpoch: () => Promise.resolve(sendEpoch),
    async sendMessage(request) {
      if (request.epoch !== sendEpoch) return { status: "unknown", message: "The send owner restarted. Check the conversation before sending again." }
      const existing = receipts.get(request.commandId)
      if (existing && JSON.stringify(existing.request) !== JSON.stringify(request)) return { status: "unknown", message: "This identity belongs to another send." }
      const result = existing?.result ?? Promise.resolve().then(async (): Promise<SendReceipt> => {
        try { await options.beforePrompt?.() }
        catch { return { status: "not-sent", message: "The scenario rejected this send before dispatch. Your text is kept; try again." } }
        const session = getSession(request.sessionId)
        if (request.mode === "follow-up") {
          session.followUps.push(request.content)
          emitUsefulState(session)
          return { status: "queued" }
        }
        setState(session, "working")
        appendMessage(session, "user", request.content)
        scheduleReply(session, request.content)
        return { status: "accepted" }
      })
      receipts.set(request.commandId, { request, result })
      const receipt = await result
      await options.afterSend?.()
      return receipt
    },
    getSessionState: () => Promise.resolve(state()),

    subscribeSessionState(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },

    selectSession(request) {
      selectedSessionId = request.sessionId
      emitState()
      return Promise.resolve()
    },

    createSession(request: CreateSessionRequest) {
      const summary: PrimeSessionSummary = {
        id: `mock-session-${crypto.randomUUID()}`,
        cwd: request.cwd,
        name: request.name,
        lifecycle: "draft",
        state: "idle",
        model: { id: "gpt-5", provider: "openai", label: "GPT-5" },
      }
      sessions.set(summary.id, {
        summary,
        followUps: [],
        messages: [],
        transport: { status: "connected" },
        generation: `mock-generation-${crypto.randomUUID()}`,
        revision: 0,
        listeners: new Set(),
        timers: new Set(),
        idleWaiters: new Set(),
      })
      emitState()
      return Promise.resolve(summary)
    },

    attachSession(request: AttachSessionRequest) {
      return Promise.resolve(snapshotEnvelope(getSession(request.sessionId)))
    },

    subscribeSession(sessionId, listener) {
      const session = getSession(sessionId)
      session.listeners.add(listener)
      return () => session.listeners.delete(listener)
    },

    abort(request: SessionAction) {
      const session = getSession(request.sessionId)
      for (const timer of session.timers) clearTimeout(timer)
      session.timers.clear()
      session.followUps = []
      setState(session, "idle")
      return Promise.resolve()
    },

    waitForIdle(request: SessionAction) {
      const session = getSession(request.sessionId)
      if (session.summary.state === "idle") return Promise.resolve()
      return new Promise<void>((resolve) => session.idleWaiters.add(resolve))
    },

    getModels() {
      return Promise.resolve([
        { id: "gpt-5", provider: "openai", label: "GPT-5" },
        { id: "gpt-5-mini", provider: "openai", label: "GPT-5 mini" },
        { id: "o3", provider: "openai", label: "o3" },
        { id: "claude-sonnet-4", provider: "anthropic", label: "Claude Sonnet 4" },
      ])
    },

    setModel(request) {
      const session = getSession(request.sessionId)
      const model = { id: request.modelId, provider: request.provider, label: request.modelId }
      session.summary = { ...session.summary, model }
      emitChange(session, { type: "session", session: session.summary })
      emitState()
      return Promise.resolve()
    },

    setEffort() {
      return Promise.resolve()
    },

    getRecurrentDepth() {
      return Promise.resolve(1)
    },

    setRecurrentDepth() {
      return Promise.resolve()
    },

    dispose() {
      for (const session of sessions.values()) {
        for (const timer of session.timers) clearTimeout(timer)
        session.timers.clear()
        session.listeners.clear()
        for (const resolve of session.idleWaiters) resolve()
        session.idleWaiters.clear()
      }
      sessions.clear()
      stateListeners.clear()
    },
  }
}

function cloneSession(session: MockSession): MockSession {
  return {
    summary: { ...session.summary },
    followUps: [...session.followUps],
    messages: [...session.messages],
    transport: { ...session.transport },
    generation: session.generation,
    revision: session.revision,
    listeners: new Set(),
    timers: new Set(),
    idleWaiters: new Set(),
  }
}

function createSeededSession(
  snapshot: PrimeSessionSnapshot,
  index: number,
): MockSession {
  return {
    summary: { ...snapshot.session },
    useful: snapshot.useful,
    followUps: [...snapshot.useful.state.sessionActions.followUps],
    messages: [...snapshot.messages],
    transport: { ...snapshot.transport },
    generation: `mock-seed-generation-${index + 1}`,
    revision: 1,
    listeners: new Set(),
    timers: new Set(),
    idleWaiters: new Set(),
  }
}
