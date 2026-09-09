import type {
  SendRequest,
  SendReceipt,
  AttachSessionRequest,
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
  createFixtureSession: (
    request: Readonly<{ cwd: string; name?: string }>,
  ) => Promise<PrimeSessionSummary>
  /** Changes fixture transport without replacing sessions or receipts. */
  setTransport: (transport: PrimeSessionTransport) => void
  /** Releases timers, listeners, and pending idle waits. */
  dispose: () => void
}

interface MockSession {
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
  generation: "mock-generation-1",
  idleWaiters: new Set(),
  listeners: new Set(),
  messages: [
    {
      content:
        "I’m the local Prime Agent mock. Send a message and I’ll exercise Ernie’s real session boundary.",
      id: "mock-assistant-1",
      role: "assistant",
    },
  ],
  revision: 1,
  summary: {
    cwd: "/Users/thor/work/ernie",
    id: "mock-session-1",
    lifecycle: "live",
    model: { id: "gpt-5", label: "GPT-5", provider: "openai" },
    name: "Build the chat workspace",
    state: "idle",
  },
  timers: new Set(),
  transport: { status: "connected" },
}

/** Selects the authoritative snapshots available when a mock client starts. */
export type MockPrimeAgentClientOptions = Readonly<{
  initialSnapshots?: readonly PrimeSessionSnapshot[]
  beforePrompt?: () => Promise<void>
  beforeAttach?: () => Promise<void>
  afterSend?: () => Promise<void>
  replyDelayMs?: number
}>

const cloneSession = (session: MockSession): MockSession => ({
  followUps: [...session.followUps],
  generation: session.generation,
  idleWaiters: new Set(),
  listeners: new Set(),
  messages: [...session.messages],
  revision: session.revision,
  summary: { ...session.summary },
  timers: new Set(),
  transport: { ...session.transport },
})

const createSeededSession = (snapshot: PrimeSessionSnapshot, index: number): MockSession => ({
  followUps: [...snapshot.useful.state.sessionActions.followUps],
  generation: `mock-seed-generation-${index + 1}`,
  idleWaiters: new Set(),
  listeners: new Set(),
  messages: [...snapshot.messages],
  revision: 1,
  summary: { ...snapshot.session },
  timers: new Set(),
  transport: { ...snapshot.transport },
  useful: snapshot.useful,
})

const emitChange = (session: MockSession, change: PrimeSessionChange) => {
  session.revision += 1
  for (const listener of session.listeners) {
    listener({
      envelope: {
        change,
        generation: session.generation,
        revision: session.revision,
        sessionId: session.summary.id,
      },
      type: "change",
    })
  }
}

const usefulSnapshot = (session: MockSession): PrimeUsefulSessionContext => {
  const fixture = createPrimeUsefulSessionFixture(session.summary, session.messages)
  return {
    ...fixture,
    children: session.useful?.children ?? fixture.children,
    childrenAvailable: session.useful?.childrenAvailable,
    state: {
      ...fixture.state,
      activeToolNames:
        session.summary.state === "working" ? (session.useful?.state.activeToolNames ?? []) : [],
      sessionActions: {
        ...fixture.state.sessionActions,
        followUps: [...session.followUps],
        queuedCount: session.followUps.length,
      },
    },
    structuredMessages: [
      ...(session.useful?.structuredMessages.filter((message) => message.role === "toolResult") ??
        []),
      ...fixture.structuredMessages,
    ],
  }
}
const emitUsefulState = (session: MockSession) => {
  const useful = usefulSnapshot(session)
  emitChange(session, { state: useful.state, type: "usefulState" })
}

const emitStructuredMessages = (session: MockSession) => {
  const useful = usefulSnapshot(session)
  emitChange(session, {
    structuredMessages: useful.structuredMessages,
    type: "structured",
  })
}

const snapshot = (session: MockSession): PrimeSessionSnapshot => ({
  messages: session.messages,
  session: session.summary,
  transport: session.transport,
  useful: usefulSnapshot(session),
})

const snapshotEnvelope = (session: MockSession): PrimeSessionSnapshotEnvelope => ({
  generation: session.generation,
  revision: session.revision,
  sessionId: session.summary.id,
  snapshot: snapshot(session),
})

/** Creates an in-memory Prime Agent whose sessions retain independent state. */
export const createMockPrimeAgentClient = (
  options: MockPrimeAgentClientOptions = {},
): MockPrimeAgentClient => {
  const seededSessions =
    options.initialSnapshots === undefined
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

  const getState = (): PrimeSessionState => ({
    revision: stateRevision,
    ...(selectedSessionId ? { selectedSessionId } : {}),
    sessions: [...sessions.values()].map(({ summary }) => summary),
  })

  const emitState = () => {
    stateRevision += 1
    const next = getState()
    for (const listener of stateListeners) {
      listener(next)
    }
  }

  const getSession = (sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session) {
      throw new Error(`Unknown mock Prime Agent session: ${sessionId}`)
    }
    return session
  }

  const setState = (session: MockSession, state: PrimeSessionSummary["state"]) => {
    session.summary = { ...session.summary, state }
    emitChange(session, { session: session.summary, type: "session" })
    emitState()
    emitUsefulState(session)
    if (state === "idle") {
      for (const resolve of session.idleWaiters) {
        resolve()
      }
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
      emitChange(session, { session: session.summary, type: "session" })
    }
    const message = {
      content,
      id: `${session.summary.id}-message-${session.revision + 1}`,
      role,
    }
    session.messages = [...session.messages, message]
    emitChange(session, { message, type: "message" })
    emitStructuredMessages(session)
    emitUsefulState(session)
  }

  const scheduleReply = (session: MockSession, content: string) => {
    const timer = setTimeout(() => {
      session.timers.delete(timer)
      appendMessage(session, "assistant", `Mock Prime Agent received: ${content}`)
      const next = session.followUps.shift()
      if (next) {
        appendMessage(session, "user", next)
        scheduleReply(session, next)
      } else {
        setState(session, "idle")
      }
    }, options.replyDelayMs ?? 450)
    session.timers.add(timer)
  }

  return {
    abort(request: SessionAction) {
      const session = getSession(request.sessionId)
      for (const timer of session.timers) {
        clearTimeout(timer)
      }
      session.timers.clear()
      session.followUps = []
      setState(session, "idle")
      return Promise.resolve()
    },
    async attachSession(request: AttachSessionRequest) {
      await options.beforeAttach?.()
      return snapshotEnvelope(getSession(request.sessionId))
    },
    async checkSend(request) {
      if (request.epoch !== sendEpoch) {
        return {
          message: "The send owner restarted. Check the conversation before sending again.",
          status: "unknown",
        }
      }
      const existing = receipts.get(request.commandId)
      if (existing && JSON.stringify(existing.request) !== JSON.stringify(request)) {
        return { message: "This identity belongs to another send.", status: "unknown" }
      }
      const result =
        existing?.result ??
        Promise.resolve<SendReceipt>({
          message: "Ernie did not receive this send. Your message was not sent; try again.",
          status: "not-sent",
        })
      receipts.set(request.commandId, { request, result })
      const receipt = await result
      await options.afterSend?.()
      return receipt
    },
    createFixtureSession(request: Readonly<{ cwd: string; name?: string }>) {
      const summary: PrimeSessionSummary = {
        cwd: request.cwd,
        id: `mock-session-${crypto.randomUUID()}`,
        lifecycle: "draft",
        model: { id: "gpt-5", label: "GPT-5", provider: "openai" },
        name: request.name,
        state: "idle",
      }
      sessions.set(summary.id, {
        followUps: [],
        generation: `mock-generation-${crypto.randomUUID()}`,
        idleWaiters: new Set(),
        listeners: new Set(),
        messages: [],
        revision: 0,
        summary,
        timers: new Set(),
        transport: { status: "connected" },
      })
      emitState()
      return Promise.resolve(summary)
    },
    dispose() {
      for (const session of sessions.values()) {
        for (const timer of session.timers) {
          clearTimeout(timer)
        }
        session.timers.clear()
        session.listeners.clear()
        for (const resolve of session.idleWaiters) {
          resolve()
        }
        session.idleWaiters.clear()
      }
      sessions.clear()
      stateListeners.clear()
    },
    getModels() {
      return Promise.resolve([
        { id: "gpt-5", label: "GPT-5", provider: "openai" },
        { id: "gpt-5-mini", label: "GPT-5 mini", provider: "openai" },
        { id: "o3", label: "o3", provider: "openai" },
        { id: "claude-sonnet-4", label: "Claude Sonnet 4", provider: "anthropic" },
      ])
    },
    getRecurrentDepth() {
      return Promise.resolve(1)
    },
    getSendEpoch: () => Promise.resolve(sendEpoch),
    getSessionState: () => Promise.resolve(getState()),
    selectSession(request) {
      selectedSessionId = request.sessionId
      emitState()
      return Promise.resolve()
    },
    async sendMessage(request) {
      if (request.epoch !== sendEpoch) {
        return {
          message: "The send owner restarted. Check the conversation before sending again.",
          status: "unknown",
        }
      }
      const existing = receipts.get(request.commandId)
      if (existing && JSON.stringify(existing.request) !== JSON.stringify(request)) {
        return { message: "This identity belongs to another send.", status: "unknown" }
      }
      const result =
        existing?.result ??
        (async (): Promise<SendReceipt> => {
          await Promise.resolve()
          try {
            await options.beforePrompt?.()
          } catch {
            return {
              message:
                "The scenario rejected this send before dispatch. Your text is kept; try again.",
              status: "not-sent",
            }
          }
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
        })()
      receipts.set(request.commandId, { request, result })
      const receipt = await result
      await options.afterSend?.()
      return receipt
    },
    setEffort() {
      return Promise.resolve()
    },
    setModel(request) {
      const session = getSession(request.sessionId)
      const model = { id: request.modelId, label: request.modelId, provider: request.provider }
      session.summary = { ...session.summary, model }
      emitChange(session, { session: session.summary, type: "session" })
      emitState()
      return Promise.resolve()
    },
    setRecurrentDepth() {
      return Promise.resolve()
    },
    setTransport(transport) {
      for (const session of sessions.values()) {
        session.transport = transport
        emitChange(session, { transport, type: "transport" })
      }
    },
    subscribeSession(sessionId, listener) {
      const session = getSession(sessionId)
      session.listeners.add(listener)
      return () => session.listeners.delete(listener)
    },
    subscribeSessionState(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    async waitForIdle(request: SessionAction) {
      const session = getSession(request.sessionId)
      if (session.summary.state === "idle") {
        return
      }
      const { promise, resolve } = Promise.withResolvers<null>()
      session.idleWaiters.add(() => resolve(null))
      await promise
    },
  }
}
