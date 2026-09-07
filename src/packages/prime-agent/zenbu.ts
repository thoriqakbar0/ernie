import { Schema } from "effect"
import { SendReceipt } from "./index"
import type {
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeAgentModelClient,
  PrimeEffort,
  PrimeModel,
  PrimeSessionEventListener,
  PrimeSessionSnapshot,
  PrimeSessionState,
  SessionAction,
  SendRequest,
} from "./index"
import {
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionState,
  parsePrimeSessionSnapshotEnvelope,
} from "./sync"

type PrimeAgentRpc = Readonly<{
  connectDaemon: () => Promise<unknown>
  getSendEpoch: () => Promise<string>
  sendMessage: (input: SendRequest) => Promise<SendReceipt>
  checkSend: (input: SendRequest) => Promise<SendReceipt>
  getSessionState: () => Promise<unknown>
  selectSession: (input: { sessionId?: string }) => Promise<void>
  createSession: (input: CreateSessionRequest) => Promise<PrimeSessionSnapshot["session"]>
  attachSession: (input: { sessionId: string }) => Promise<unknown>
  abort: (input: SessionAction) => Promise<void>
  waitForIdle: (input: SessionAction) => Promise<void>
  getModels: (input: { sessionId?: string; all?: boolean }) => Promise<readonly PrimeModel[]>
  setModel: (input: SessionAction & { provider: string; modelId: string }) => Promise<void>
  getRecurrentDepth: (input: SessionAction) => Promise<number>
  setEffort: (input: SessionAction & { effort: PrimeEffort }) => Promise<void>
  setRecurrentDepth: (input: SessionAction & { recurrentDepth: number }) => Promise<void>
}>

type PrimeAgentEvents = Readonly<{
  primeSessionStateChanged: Readonly<{
    subscribe: (listener: (state: unknown) => void) => () => void
  }>
  primeSessionChanged: Readonly<{
    subscribe: (listener: (event: unknown) => void) => () => void
  }>
  primeSessionSnapshot: Readonly<{
    subscribe: (listener: (event: unknown) => void) => () => void
  }>
}>

export interface ZenbuPrimeAgentClient extends PrimeAgentModelClient {
  /** Requests daemon connection and validates the returned session catalog. */
  connectDaemon: () => Promise<PrimeSessionState>
  dispose: () => void
}

/** Adapts Zenbu RPC and events into Ernie's ordered Prime Agent client contract. */
export const createZenbuPrimeAgentClient = (
  rpc: PrimeAgentRpc,
  events: PrimeAgentEvents,
): ZenbuPrimeAgentClient => {
  const listeners = new Map<string, Set<PrimeSessionEventListener>>()
  const stateListeners = new Set<(state: PrimeSessionState) => void>()
  // Route by identity before traversing a transcript; subscribed payloads still require full parsing.
  const hasSessionListener = (input: unknown) =>
    typeof input === "object" &&
    input !== null &&
    "sessionId" in input &&
    typeof input.sessionId === "string" &&
    listeners.has(input.sessionId)
  const dispatch = (event: Parameters<PrimeSessionEventListener>[0]) => {
    for (const listener of listeners.get(event.envelope.sessionId) ?? []) {
      listener(event)
    }
  }
  const unsubscribeChanges = events.primeSessionChanged.subscribe((input) => {
    if (!hasSessionListener(input)) {
      return
    }
    const parsed = parsePrimeSessionChangeEnvelope(input)
    if (parsed.ok) {
      dispatch({ envelope: parsed.value, type: "change" })
    }
  })
  const unsubscribeSnapshots = events.primeSessionSnapshot.subscribe((input) => {
    if (!hasSessionListener(input)) {
      return
    }
    const parsed = parsePrimeSessionSnapshotEnvelope(input)
    if (parsed.ok) {
      dispatch({ envelope: parsed.value, type: "snapshot" })
    }
  })
  const unsubscribeState = events.primeSessionStateChanged.subscribe((input) => {
    const parsed = parsePrimeSessionState(input)
    if (!parsed.ok) {
      return
    }
    for (const listener of stateListeners) {
      listener(parsed.value)
    }
  })

  return {
    abort: (request: SessionAction) => rpc.abort(request),
    async attachSession(request: AttachSessionRequest) {
      const parsed = parsePrimeSessionSnapshotEnvelope(await rpc.attachSession(request))
      if (!parsed.ok) {
        throw parsed.error
      }
      return parsed.value
    },
    checkSend: async (request) =>
      Schema.decodeUnknownSync(SendReceipt)(await rpc.checkSend(request)),
    async connectDaemon() {
      const parsed = parsePrimeSessionState(await rpc.connectDaemon())
      if (!parsed.ok) {
        throw parsed.error
      }
      return parsed.value
    },
    createSession: (request: CreateSessionRequest) => rpc.createSession(request),
    dispose() {
      unsubscribeChanges()
      unsubscribeSnapshots()
      unsubscribeState()
      stateListeners.clear()
      listeners.clear()
    },
    getModels: (request: { sessionId?: string; all?: boolean }) => rpc.getModels(request),
    getRecurrentDepth: (request) => rpc.getRecurrentDepth(request),
    getSendEpoch: async () =>
      Schema.decodeUnknownSync(Schema.NonEmptyString)(await rpc.getSendEpoch()),
    async getSessionState() {
      const parsed = parsePrimeSessionState(await rpc.getSessionState())
      if (!parsed.ok) {
        throw parsed.error
      }
      return parsed.value
    },
    selectSession: (request) => rpc.selectSession(request),
    sendMessage: async (request) =>
      Schema.decodeUnknownSync(SendReceipt)(await rpc.sendMessage(request)),
    setEffort: (request) => rpc.setEffort(request),
    setModel: (request) => rpc.setModel(request),
    setRecurrentDepth: (request) => rpc.setRecurrentDepth(request),
    subscribeSession(sessionId, listener) {
      const sessionListeners = listeners.get(sessionId) ?? new Set()
      sessionListeners.add(listener)
      listeners.set(sessionId, sessionListeners)
      return () => {
        sessionListeners.delete(listener)
        if (sessionListeners.size > 0) {
          return
        }
        listeners.delete(sessionId)
      }
    },
    subscribeSessionState(listener) {
      stateListeners.add(listener)
      return () => stateListeners.delete(listener)
    },
    waitForIdle: (request: SessionAction) => rpc.waitForIdle(request),
  }
}
