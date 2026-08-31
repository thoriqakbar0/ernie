import type {
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeAgentModelClient,
  PrimeSessionChangeEnvelope,
  PrimeSessionEventListener,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PromptRequest,
  SessionAction,
  SessionTextAction,
} from "./index"
import {
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionSnapshotEnvelope,
} from "./sync"

type PrimeAgentRpc = Readonly<{
  listSessions(): Promise<readonly PrimeSessionSnapshot["session"][]>
  createSession(input: CreateSessionRequest): Promise<PrimeSessionSnapshot["session"]>
  attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope>
  prompt(input: PromptRequest): Promise<{ admissionId: string; commandId: string }>
  followUp(input: SessionTextAction): Promise<void>
  abort(input: SessionAction): Promise<void>
  waitForIdle(input: SessionAction): Promise<void>
  getModels(input: SessionAction): Promise<readonly { id: string; provider: string; label: string }[]>
  setModel(input: SessionAction & { provider: string; modelId: string }): Promise<void>
}>

type PrimeAgentEvents = Readonly<{
  primeSessionChanged: Readonly<{
    subscribe(listener: (event: PrimeSessionChangeEnvelope) => void): () => void
  }>
  primeSessionSnapshot: Readonly<{
    subscribe(listener: (event: PrimeSessionSnapshotEnvelope) => void): () => void
  }>
}>

export interface ZenbuPrimeAgentClient extends PrimeAgentModelClient {
  dispose(): void
}

/** Adapts Zenbu RPC and events into Ernie's ordered Prime Agent client contract. */
export function createZenbuPrimeAgentClient(
  rpc: PrimeAgentRpc,
  events: PrimeAgentEvents,
): ZenbuPrimeAgentClient {
  const listeners = new Map<string, Set<PrimeSessionEventListener>>()
  const dispatch = (event: Parameters<PrimeSessionEventListener>[0]) => {
    for (const listener of listeners.get(event.envelope.sessionId) ?? []) listener(event)
  }
  const unsubscribeChanges = events.primeSessionChanged.subscribe((input) => {
    const parsed = parsePrimeSessionChangeEnvelope(input)
    if (parsed.ok) dispatch({ type: "change", envelope: parsed.value })
  })
  const unsubscribeSnapshots = events.primeSessionSnapshot.subscribe((input) => {
    const parsed = parsePrimeSessionSnapshotEnvelope(input)
    if (parsed.ok) dispatch({ type: "snapshot", envelope: parsed.value })
  })

  return {
    listSessions: () => rpc.listSessions(),
    createSession: (request: CreateSessionRequest) => rpc.createSession(request),
    async attachSession(request: AttachSessionRequest) {
      const parsed = parsePrimeSessionSnapshotEnvelope(await rpc.attachSession(request))
      if (!parsed.ok) throw parsed.error
      return parsed.value
    },
    subscribeSession(sessionId, listener) {
      const sessionListeners = listeners.get(sessionId) ?? new Set()
      sessionListeners.add(listener)
      listeners.set(sessionId, sessionListeners)
      return () => {
        sessionListeners.delete(listener)
        if (sessionListeners.size > 0) return
        listeners.delete(sessionId)
      }
    },
    prompt: (request: PromptRequest) => rpc.prompt(request),
    followUp: (request: SessionTextAction) => rpc.followUp(request),
    abort: (request: SessionAction) => rpc.abort(request),
    waitForIdle: (request: SessionAction) => rpc.waitForIdle(request),
    getModels: (request: SessionAction) => rpc.getModels(request),
    setModel: (request) => rpc.setModel(request),
    dispose() {
      unsubscribeChanges()
      unsubscribeSnapshots()
      listeners.clear()
    },
  }
}
