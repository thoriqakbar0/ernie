import type {
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
  PromptAdmission,
  PromptRequest,
  SessionAction,
  SessionTextAction,
} from "../../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"

/** Prime Agent mock used by Ernie's local interactive preview. */
export interface MockPrimeAgentClient extends PrimeAgentModelClient {
  /** Releases timers, listeners, and pending idle waits. */
  dispose(): void
}

type MockSession = {
  summary: PrimeSessionSummary
  messages: PrimeSessionMessage[]
  transport: PrimeSessionTransport
  generation: string
  revision: number
  readonly listeners: Set<PrimeSessionEventListener>
  readonly timers: Set<ReturnType<typeof setTimeout>>
  readonly idleWaiters: Set<() => void>
}

const initialSession: MockSession = {
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

  const emitUsefulState = (session: MockSession) => {
    const useful = createPrimeUsefulSessionFixture(session.summary, session.messages)
    emitChange(session, { type: "usefulState", state: useful.state })
  }

  const emitStructuredMessages = (session: MockSession) => {
    const useful = createPrimeUsefulSessionFixture(session.summary, session.messages)
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
      setState(session, "idle")
    }, 450)
    session.timers.add(timer)
  }

  const snapshot = (session: MockSession): PrimeSessionSnapshot => ({
    session: session.summary,
    messages: session.messages,
    useful: createPrimeUsefulSessionFixture(session.summary, session.messages),
    transport: session.transport,
  })

  const snapshotEnvelope = (session: MockSession): PrimeSessionSnapshotEnvelope => ({
    sessionId: session.summary.id,
    generation: session.generation,
    revision: session.revision,
    snapshot: snapshot(session),
  })

  return {
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

    prompt(request: PromptRequest): Promise<PromptAdmission> {
      const session = getSession(request.sessionId)
      setState(session, "working")
      appendMessage(session, "user", request.content)
      scheduleReply(session, request.content)
      return Promise.resolve({
        admissionId: request.admissionId,
        commandId: request.commandId,
      })
    },

    followUp(request: SessionTextAction) {
      const session = getSession(request.sessionId)
      appendMessage(session, "user", request.content)
      scheduleReply(session, request.content)
      return Promise.resolve()
    },

    abort(request: SessionAction) {
      const session = getSession(request.sessionId)
      for (const timer of session.timers) clearTimeout(timer)
      session.timers.clear()
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
    messages: [...snapshot.messages],
    transport: { ...snapshot.transport },
    generation: `mock-seed-generation-${index + 1}`,
    revision: 1,
    listeners: new Set(),
    timers: new Set(),
    idleWaiters: new Set(),
  }
}
