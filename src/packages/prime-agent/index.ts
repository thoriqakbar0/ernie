/** One session listed by Prime Agent. */
export type PrimeSessionSummary = Readonly<{
  id: string
  cwd: string
  name?: string
  lifecycle: "archived" | "draft" | "live"
  state: "idle" | "working" | "recovering"
  model?: PrimeModel
}>

/** One model Prime Agent exposes to an attached session. */
export type PrimeModel = Readonly<{ id: string; provider: string; label: string }>

/** One transcript message in an attached Prime Agent session. */
export type PrimeSessionMessage = Readonly<{
  id: string
  role: "assistant" | "system" | "user"
  content: string
}>

/** Current health of Ernie's transport to one Prime Agent session. */
export type PrimeSessionTransport =
  | Readonly<{ status: "connected" }>
  | Readonly<{ status: "reconnecting"; error?: string }>
  | Readonly<{ status: "failed"; error: string }>

/** Prime Agent's authoritative state when Ernie attaches to a session. */
export type PrimeSessionSnapshot = Readonly<{
  session: PrimeSessionSummary
  messages: readonly PrimeSessionMessage[]
  transport: PrimeSessionTransport
}>

/** One small projected change after the main process updates its snapshot. */
export type PrimeSessionChange =
  | Readonly<{ type: "session"; session: PrimeSessionSummary }>
  | Readonly<{ type: "message"; message: PrimeSessionMessage }>
  | Readonly<{ type: "messages"; messages: readonly PrimeSessionMessage[] }>
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

/** A request Ernie sends when it asks Prime Agent to own a turn. */
export type PromptRequest = Readonly<{
  sessionId: string
  admissionId: string
  commandId: string
  content: string
}>

/** Prime Agent's confirmation that it owns the submitted turn. */
export type PromptAdmission = Readonly<{
  admissionId: string
  commandId: string
}>

/** A queued instruction for the active Prime Agent turn. */
export type SessionTextAction = Readonly<{
  sessionId: string
  content: string
}>

/** A Prime Agent action scoped to one attached session. */
export type SessionAction = Readonly<{
  sessionId: string
}>

/** The Prime Agent operations required by Ernie's first chat flow. */
export interface PrimeAgentClient {
  /** Lists sessions visible to Ernie. */
  listSessions(): Promise<readonly PrimeSessionSummary[]>

  /** Creates a new session without attaching a renderer to it. */
  createSession(request: CreateSessionRequest): Promise<PrimeSessionSummary>

  /** Attaches Ernie and returns the authoritative session snapshot. */
  attachSession(request: AttachSessionRequest): Promise<PrimeSessionSnapshotEnvelope>

  /** Subscribes to ordered changes after attachment. */
  subscribeSession(sessionId: string, listener: PrimeSessionEventListener): () => void

  /** Submits one turn and resolves only after Prime Agent confirms ownership. */
  prompt(request: PromptRequest): Promise<PromptAdmission>

  /** Queues one follow-up after the active turn. */
  followUp(request: SessionTextAction): Promise<void>

  /** Requests cancellation of active work in one session. */
  abort(request: SessionAction): Promise<void>

  /** Resolves when one session has no active work left. */
  waitForIdle(request: SessionAction): Promise<void>

}

/** Optional model-control capability used by Ernie's full workspace shell. */
export interface PrimeAgentModelClient extends PrimeAgentClient {
  getModels(request: SessionAction): Promise<readonly PrimeModel[]>
  setModel(request: SessionAction & { provider: string; modelId: string }): Promise<void>
}
