export { SendRequest, SendReceipt } from "./send"
import type { SendRequest, SendReceipt } from "./send"

/** One session listed by Prime Agent. */
export type PrimeSessionSummary = Readonly<{
  id: string
  cwd: string
  name?: string
  lifecycle: "archived" | "draft" | "live"
  state: "idle" | "working" | "recovering"
  model?: PrimeModel
  activitySummary?: string
  activityAt?: string
  workerFailed?: boolean
}>

/** One authoritative session-state revision published by Ernie's main process. */
export type PrimeSessionState = Readonly<{
  revision: number
  selectedSessionId?: string
  sessions: readonly PrimeSessionSummary[]
}>

/** One model Prime Agent exposes to an attached session. */
export type PrimeModel = Readonly<{ id: string; provider: string; label: string }>

export type PrimeEffort = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

/** One JSON value that can safely cross Ernie's process boundary. */
export type PrimeJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly PrimeJsonValue[]
  | Readonly<{ [key: string]: PrimeJsonValue }>

/** One transcript message in an attached Prime Agent session. */
export type PrimeSessionMessage = Readonly<{
  id: string
  role: "assistant" | "system" | "user"
  content: string
}>

/** One JSON-safe structured Prime Agent transcript message. */
export type PrimeStructuredMessage = Readonly<{ [key: string]: PrimeJsonValue }>

/** One queued or active action owned by the Prime Agent session. */
export type PrimeSessionActions = Readonly<{
  queuedCount: number
  steering: readonly string[]
  followUps: readonly string[]
  active?: Readonly<{
    kind: "session_command" | "turn"
    phase: "committing" | "preparing" | "running"
    label?: string
  }>
}>

/** One live RLM child known to the attached Prime Agent session. */
export type PrimeRlmChild = Readonly<{
  id: string
  parentId?: string
  activeSessionId?: string
  sessionName?: string
  model?: string
  label: string
  status: "cancelled" | "done" | "error" | "queued" | "running"
  durationMs?: number
  answerPreview?: string
  repliedSinceTask?: boolean
  toolUseCount?: number
  tokenCount?: number
  recap?: string
  sessionDir: string
  activity?: Readonly<{
    kind: "executing" | "waiting" | "writing"
    toolName?: string
  }>
  error?: string
}>

/** Prime Agent's useful authoritative state for one attached session. */
export type PrimeUsefulSessionState = Readonly<{
  activeSessionId?: string
  sessionId: string
  cwd: string
  sessionName?: string
  sessionFile?: string
  sessionDir?: string
  leafId: string | null
  model?: PrimeModel
  thinkingLevel: string
  serviceTier: string
  availableThinkingLevels: readonly string[]
  isStreaming: boolean
  isCompacting: boolean
  isBashRunning: boolean
  retryAttempt: number
  steeringMode: "all" | "one-at-a-time"
  followUpMode: "all" | "one-at-a-time"
  autoCompactionEnabled: boolean
  messageCount: number
  sessionActions: PrimeSessionActions
  compactionCount: number
  goal: PrimeJsonValue
  heartbeat?: PrimeJsonValue | null
  scopedModels: readonly Readonly<{
    model: PrimeModel
    thinkingLevel?: string
  }>[]
  activeToolNames: readonly string[]
  contextUsage: PrimeJsonValue
  recap?: string
}>

/** Prime Agent's useful structured context and RLM topology. */
export type PrimeUsefulSessionContext = Readonly<{
  state: PrimeUsefulSessionState
  structuredMessages: readonly PrimeStructuredMessage[]
  streamingMessage?: PrimeStructuredMessage
  sessionContext?: Readonly<{
    messages: readonly PrimeStructuredMessage[]
    thinkingLevel: string
    serviceTier: string
    model: Readonly<{ provider: string; modelId: string }> | null
  }>
  sessionTree?: Readonly<{
    tree: PrimeJsonValue
    leafId: string | null
  }>
  parent?: Readonly<{
    activeSessionId?: string
    sessionId?: string
    nodeId?: string
    childId?: string
  }>
  children: readonly PrimeRlmChild[]
  lastEventSequence?: number
  lastEventCursor?: Readonly<{ generation: string; sequence: number }>
  replay?: Readonly<{
    status: "complete" | "partial" | "unavailable"
    fromSequence?: number
    toSequence: number
    fromCursor?: Readonly<{ generation: string; sequence: number }>
    toCursor?: Readonly<{ generation: string; sequence: number }>
    reason?: string
  }>
}>

/** Current health of Ernie's transport to one Prime Agent session. */
export type PrimeSessionTransport =
  | Readonly<{ status: "connected" }>
  | Readonly<{ status: "reconnecting"; error?: string }>
  | Readonly<{ status: "failed"; error: string }>

// @lat: [[runtime#Prime Agent runtime#Snapshot authority]]
/** Prime Agent's authoritative state when Ernie attaches to a session. */
export type PrimeSessionSnapshot = Readonly<{
  session: PrimeSessionSummary
  messages: readonly PrimeSessionMessage[]
  useful: PrimeUsefulSessionContext
  transport: PrimeSessionTransport
}>

/** One small projected change after the main process updates its snapshot. */
export type PrimeSessionChange =
  | Readonly<{ type: "session"; session: PrimeSessionSummary }>
  | Readonly<{ type: "message"; message: PrimeSessionMessage }>
  | Readonly<{ type: "messages"; messages: readonly PrimeSessionMessage[] }>
  | Readonly<{
      type: "structured"
      structuredMessages: readonly PrimeStructuredMessage[]
      streamingMessage?: PrimeStructuredMessage
    }>
  | Readonly<{ type: "usefulState"; state: PrimeUsefulSessionState }>
  | Readonly<{
      type: "sessionContext"
      sessionContext?: PrimeUsefulSessionContext["sessionContext"]
    }>
  | Readonly<{
      type: "family"
      parent?: PrimeUsefulSessionContext["parent"]
      sessionTree?: PrimeUsefulSessionContext["sessionTree"]
      children: readonly PrimeRlmChild[]
    }>
  | Readonly<{
      type: "eventPosition"
      lastEventSequence?: number
      lastEventCursor?: PrimeUsefulSessionContext["lastEventCursor"]
      replay?: PrimeUsefulSessionContext["replay"]
    }>
  | Readonly<{ type: "transport"; transport: PrimeSessionTransport }>

/** One authoritative projected snapshot at a specific service revision. */
export type PrimeSessionSnapshotEnvelope = Readonly<{
  sessionId: string
  generation: string
  revision: number
  snapshot: PrimeSessionSnapshot
}>

/** One ordered projected change after a known service revision. */
export type PrimeSessionChangeEnvelope = Readonly<{
  sessionId: string
  generation: string
  revision: number
  change: PrimeSessionChange
}>

/** One snapshot or ordered change delivered for a renderer attachment. */
export type PrimeSessionSyncEvent =
  | Readonly<{ type: "snapshot"; envelope: PrimeSessionSnapshotEnvelope }>
  | Readonly<{ type: "change"; envelope: PrimeSessionChangeEnvelope }>

/** Receives ordered changes for one attached Prime Agent session. */
export type PrimeSessionEventListener = (event: PrimeSessionSyncEvent) => void

/** Values used to create one Prime Agent session. */
export type CreateSessionRequest = Readonly<{
  cwd: string
  name?: string
}>

/** Values used to attach Ernie to an existing Prime Agent session. */
export type AttachSessionRequest = Readonly<{
  sessionId: string
}>

/** A Prime Agent action scoped to one attached session. */
export type SessionAction = Readonly<{
  sessionId: string
}>

/** The Prime Agent operations required by Ernie's first chat flow. */
export interface PrimeAgentClient {
  /** Identifies the current main-process receipt owner before dispatch. */
  getSendEpoch(): Promise<string>

  /** Dispatches once per identity, or retrieves its existing receipt. */
  sendMessage(request: SendRequest): Promise<SendReceipt>

  /** Reads the newest authoritative session state. */
  getSessionState(): Promise<PrimeSessionState>

  /** Observes newer authoritative session-state revisions. */
  subscribeSessionState(listener: (state: PrimeSessionState) => void): () => void

  /** Selects the session displayed by Ernie, or clears selection. */
  selectSession(request: Readonly<{ sessionId?: string }>): Promise<void>

  /** Creates a new session without attaching a renderer to it. */
  createSession(request: CreateSessionRequest): Promise<PrimeSessionSummary>

  /** Attaches Ernie and returns the authoritative session snapshot. */
  attachSession(request: AttachSessionRequest): Promise<PrimeSessionSnapshotEnvelope>

  /** Subscribes to ordered changes after attachment. */
  subscribeSession(sessionId: string, listener: PrimeSessionEventListener): () => void

  /** Requests cancellation of active work in one session. */
  abort(request: SessionAction): Promise<void>

  /** Resolves when one session has no active work left. */
  waitForIdle(request: SessionAction): Promise<void>

}

/** Optional model-control capability used by Ernie's full workspace shell. */
export interface PrimeAgentModelClient extends PrimeAgentClient {
  getModels(request: SessionAction): Promise<readonly PrimeModel[]>
  setModel(request: SessionAction & { provider: string; modelId: string }): Promise<void>
  getRecurrentDepth(request: SessionAction): Promise<number>
  setEffort(request: SessionAction & { effort: PrimeEffort }): Promise<void>
  setRecurrentDepth(request: SessionAction & { recurrentDepth: number }): Promise<void>
}
