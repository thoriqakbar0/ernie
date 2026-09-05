import { Schema } from "effect"
import { SendRequest, SendReceipt } from "./index"
import type {
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeAgentModelClient,
  PrimeEffort,
  PrimeSessionChangeEnvelope,
  PrimeSessionEventListener,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionState,
  SessionAction,
} from "./index"
import {
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionState,
  parsePrimeSessionSnapshotEnvelope,
} from "./sync"

type PrimeAgentRpc = Readonly<{
  getSendEpoch(): Promise<string>
  sendMessage(input: SendRequest): Promise<SendReceipt>
  getSessionState(): Promise<PrimeSessionState>
  selectSession(input: { sessionId?: string }): Promise<void>
  createSession(input: CreateSessionRequest): Promise<PrimeSessionSnapshot["session"]>
  attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope>
  abort(input: SessionAction): Promise<void>
  waitForIdle(input: SessionAction): Promise<void>
  getModels(input: SessionAction): Promise<readonly { id: string; provider: string; label: string }[]>
  setModel(input: SessionAction & { provider: string; modelId: string }): Promise<void>
  getRecurrentDepth(input: SessionAction): Promise<number>
  setEffort(input: SessionAction & { effort: PrimeEffort }): Promise<void>
  setRecurrentDepth(input: SessionAction & { recurrentDepth: number }): Promise<void>
}>

type PrimeAgentEvents = Readonly<{
  primeSessionStateChanged: Readonly<{
    subscribe(listener: (state: PrimeSessionState) => void): () => void
  }>
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
  const stateListeners = new Set<(state: PrimeSessionState) => void>()
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
  const unsubscribeState = events.primeSessionStateChanged.subscribe((input) => {
    const parsed = parsePrimeSessionState(input)
    if (!parsed.ok) return
    for (const listener of stateListeners) listener(parsed.value)
  })

  return {
    async getSessionState() {
      const parsed = parsePrimeSessionState(await rpc.getSessionState())
      if (!parsed.ok) throw parsed.error
      return parsed.value
    },
    subscribeSessionState(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    selectSession: (request) => rpc.selectSession(request),
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
    getSendEpoch: async () => Schema.decodeUnknownSync(Schema.NonEmptyString)(await rpc.getSendEpoch()),
    sendMessage: async (request) => Schema.decodeUnknownSync(SendReceipt)(await rpc.sendMessage(request)),
    abort: (request: SessionAction) => rpc.abort(request),
    waitForIdle: (request: SessionAction) => rpc.waitForIdle(request),
    getModels: (request: SessionAction) => rpc.getModels(request),
    setModel: (request) => rpc.setModel(request),
    getRecurrentDepth: (request) => rpc.getRecurrentDepth(request),
    setEffort: (request) => rpc.setEffort(request),
    setRecurrentDepth: (request) => rpc.setRecurrentDepth(request),
    dispose() {
      unsubscribeChanges()
      unsubscribeSnapshots()
      unsubscribeState()
      stateListeners.clear()
      listeners.clear()
    },
  }
}
