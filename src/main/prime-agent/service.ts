import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Service } from "@zenbujs/core/runtime"
import { RpcService } from "@zenbujs/core/services"
import { Effect, Option, Schema } from "effect"
import { ConversationOrigin, decodeAgentInput } from "../../packages/agents"
import { nativeConversationConfig } from "./agent-config"
import { AgentStoreService } from "../services/agent-store"
import {
  DaemonAgentConnection,
  DaemonClient,
  type AgentConnectionEvent,
  type DaemonCommand,
  type DaemonResponse,
} from "prime-agent"

import type {
  PrimeModel,
  PrimeSessionState,
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionSummary,
} from "../../packages/prime-agent"
import {
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionSnapshotEnvelope,
} from "../../packages/prime-agent/sync"
import {
  diffPrimeSessionSnapshots,
  projectPrimeSessionSnapshot,
} from "./projection"
import { SendRequest, type SendReceipt } from "../../packages/prime-agent"
import { SendReceipts } from "./send-receipts"
import { checkPrimeAgentCommandAvailability } from "./command-availability"
import { projectCurrentPrimeSessionRefresh } from "./refresh"
import { enrichPrimeSessionSnapshot } from "./snapshot"
import {
  chooseAvailableSessionName,
  deriveSessionName,
  isGenericSessionName,
  isUnavailableSessionNameError,
} from "./session-name"
import {
  createPrimeAgentRecoveryRetry,
  runPrimeAgentRecoveryLoop,
} from "./recovery-retry"

type CommandBody = DaemonCommand extends infer Command
  ? Command extends { id?: string }
    ? Omit<Command, "id">
    : never
  : never

type PrimeAgentEndpoint =
  | Readonly<{
      ownership: "external"
      socketPath: string
    }>
  | Readonly<{
      ownership: "managed"
      socketPath: string
      agentDir?: string
      executablePath: string
    }>

type SessionAttachment = {
  readonly sessionId: string
  generation: string
  revision: number
  snapshot: PrimeSessionSnapshot
  connection: DaemonAgentConnection | undefined
  unsubscribe: () => void
  refreshTimer: ReturnType<typeof setTimeout> | undefined
  refreshTail: Promise<void>
  refreshFailureCount: number
  needsRefresh: boolean
  disposed: boolean
}

type SessionTarget = Readonly<{
  activeSessionId?: string
  sessionFile?: string
}>

type CatalogSession = Readonly<{
  summary: PrimeSessionSummary
  target: SessionTarget
}>

const STREAM_REFRESH_INTERVAL_MS = 50
const RECOVERY_RETRY_INTERVAL_MS = 1_000
const MAX_REFRESH_FAILURES = 2
const CREATE_SESSION_TIMEOUT_MS = 60_000
const CREATE_SESSION_NAME_RETRIES = 3
const ATTACHMENT_STARTUP_TIMEOUT_MS = 10_000
const ATTACHMENT_STARTUP_RETRY_MS = 100
const SESSION_CATALOG_REFRESH_MS = 1_000
const PRIME_AGENT_DAEMON_WORKER_ENV = [
  "PRIME_AGENT_INTERNAL_DAEMON_WORKER",
  "PRIME_AGENT_INTERNAL_DAEMON_WORKER_TOKEN",
  "PRIME_AGENT_INTERNAL_DAEMON_WORKER_ACTIVE_SESSION_ID",
  "PRIME_AGENT_INTERNAL_DAEMON_SUPERVISOR_SOCKET",
  "PRIME_AGENT_INTERNAL_DAEMON_WORKER_RECOVERY_JOURNAL",
  "PRIME_AGENT_INTERNAL_DAEMON_WORKER_STARTUP_GATE_FD",
  "PRIME_AGENT_INTERNAL_ORPHAN_PROCESS_JOURNAL",
  "PRIME_AGENT_INTERNAL_SESSION_LEASES",
  "PRIME_AGENT_INTERNAL_SESSION_LEASE_OWNER_ID",
] as const
const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

// @lat: [[architecture#Prime Agent boundary]]
/** Owns Ernie's shared Prime Agent daemon client and logical session attachments. */
export class PrimeAgentService extends Service.create({
  key: "primeAgent",
  deps: { rpc: RpcService, agentStore: AgentStoreService },
}) {
  private readonly sendReceipts = new SendReceipts()
  private readonly endpoint = readPrimeAgentEndpoint()
  private readonly attachments = new Map<string, SessionAttachment>()
  private readonly attachmentPromises = new Map<string, Promise<SessionAttachment>>()
  private readonly summaries = new Map<string, PrimeSessionSummary>()
  private readonly sessionTargets = new Map<string, SessionTarget>()
  private stateRevision = 0
  private selectedSessionId: string | undefined
  private catalogSessions: readonly PrimeSessionSummary[] = []
  private catalogRefresh: Promise<void> | undefined
  private client: DaemonClient | undefined
  private connecting: Promise<DaemonClient> | undefined
  private unsubscribeClientClose: (() => void) | undefined
  private recoveryPromise: Promise<void> | undefined
  private readonly recoveryRetry = createPrimeAgentRecoveryRetry(RECOVERY_RETRY_INTERVAL_MS)
  private recoveryRequested = false
  private disposed = false

  /** Registers one cleanup owner for every Prime Agent resource. */
  evaluate() {
    this.setup("prime-agent-runtime", () => () => this.disposeRuntime())
    this.setup("prime-agent-catalog", () => {
      const timer = setInterval(() => {
        void this.refreshSessionCatalog().catch(() => undefined)
      }, SESSION_CATALOG_REFRESH_MS)
      return () => clearInterval(timer)
    })
  }

  /** Reads the newest authoritative session state. */
  async getSessionState(): Promise<PrimeSessionState> {
    await this.refreshSessionCatalog()
    return this.sessionState()
  }

  /** Selects the session displayed by Ernie, or clears selection. */
  async selectSession(input: { sessionId?: string }) {
    const sessionId = input.sessionId?.trim()
    if (sessionId && !this.catalogSessions.some(({ id }) => id === sessionId)) {
      throw new Error("The selected Prime Agent session is unavailable")
    }
    if (sessionId && (!this.sessionTargets.get(sessionId)?.activeSessionId || this.summaries.get(sessionId)?.workerFailed)) {
      await this.resumeSession(await this.getClient(), sessionId)
    }
    if (sessionId === this.selectedSessionId) return
    this.selectedSessionId = sessionId
    this.publishSessionState()
  }

  /** Creates one resident Prime Agent session without attaching a renderer. */
  async createSession(input: { cwd: string; name?: string; origin?: ConversationOrigin; creationId?: string }) {
    const origin = input.origin ? await Effect.runPromise(decodeAgentInput(ConversationOrigin, input.origin)) : undefined
    const data = await this.request({ type: "list", all: true })
    const knownSessions = readSessionList(data).map(toCatalogSession).map(({ summary }) => summary)
    const rejectedNames = new Set<string>()
    let lastCollision: unknown

    for (let attempt = 0; attempt <= CREATE_SESSION_NAME_RETRIES; attempt += 1) {
      const name = chooseAvailableSessionName(input.name, knownSessions, rejectedNames)
      try {
        const created = await this.request(
          {
            type: "create",
            name,
            config: origin ? nativeConversationConfig(origin) : { cwd: input.cwd },
            lifecycle: "resident",
          },
          CREATE_SESSION_TIMEOUT_MS,
        )
        const { summary: session, target } = toCatalogSession(readRecord(created, "create response"))
        this.summaries.set(session.id, session)
        this.sessionTargets.set(session.id, target)
        this.upsertCatalogSession(session)
        if (origin) {
          await Effect.runPromise(Effect.gen({ self: this }, function* () {
            const roster = yield* this.ctx.agentStore.read()
            yield* this.ctx.agentStore.write({ ...roster, associations: [...roster.associations, { sessionId: session.id, ...(input.creationId ? { creationId: input.creationId } : {}), agentId: null, visitedAt: Date.now(), origin }] })
          }))
        }
        return session
      } catch (error) {
        if (!name || !isUnavailableSessionNameError(error, name)) throw error
        rejectedNames.add(name)
        lastCollision = error
      }
    }

    throw new Error("Prime Agent session name stayed unavailable after retries", {
      cause: lastCollision,
    })
  }

  /** Attaches one logical connection and returns its current projected snapshot. */
  async attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope> {
    if (this.recoveryPromise) await this.recoveryPromise
    return snapshotEnvelope(await this.getAttachment(input.sessionId))
  }

  /** Returns the identity of this in-memory receipt owner. */
  async getSendEpoch(): Promise<string> { return this.sendReceipts.epoch }

  /** Inspects a receipt without attaching to the daemon or dispatching a message. */
  async checkSend(input: SendRequest): Promise<SendReceipt> {
    return this.sendReceipts.check(Schema.decodeUnknownSync(SendRequest)(input))
  }

  /** Reserves an immutable send before entering the native transport. */
  async sendMessage(input: SendRequest): Promise<SendReceipt> {
    const request = Schema.decodeUnknownSync(SendRequest)(input)
    return this.sendReceipts.send(request, async () => {
      const { attachment, connection } = await this.getReadyAttachment(request.sessionId)
      if (request.mode === "prompt") {
        await this.nameDraftSessionFromPrompt(attachment, connection, request.content)
      }
      if (request.mode === "prompt") return async () => {
        await connection.prompt(request.content, { source: "interactive" })
        return { status: "accepted" }
      }
      const { activeSessionId } = Schema.decodeUnknownSync(Schema.Struct({ activeSessionId: Schema.NonEmptyString }))(await connection.getState())
      const client = await this.getClient()
      return async () => {
        // The native convenience wrapper discards queued:false for a coalesced follow-up.
        const response = requireSuccess(await client.request({ type: "follow_up", activeSessionId, message: request.content }))
        const { queued } = Schema.decodeUnknownSync(Schema.Struct({ queued: Schema.Boolean }))(response)
        return queued ? { status: "queued" } : { status: "not-sent", message: "Prime Agent already has an equivalent follow-up pending. This message was not added again." }
      }
    })
  }

  /** Requests cancellation through its owning logical attachment. */
  async abort(input: { sessionId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.abort()
  }

  /** Waits until the owning logical attachment reports no active work. */
  async waitForIdle(input: { sessionId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.waitForIdle()
  }

  /** Reads models through the owning logical attachment. */
  async getModels(input: { sessionId: string }): Promise<readonly PrimeModel[]> {
    const connection = await this.getReadyConnection(input.sessionId)
    return (await connection.getAvailableModels()).map((model) => ({
      id: model.id,
      provider: model.provider,
      label: model.name ?? model.id,
    }))
  }

  /** Changes the model through the owning logical attachment. */
  async setModel(input: { sessionId: string; provider: string; modelId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setModel(input.provider, input.modelId)
  }

  async getRecurrentDepth(input: { sessionId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    return (await connection.getRlmMaxDepthStatus()).maxDepth
  }

  async setEffort(input: {
    sessionId: string
    effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
  }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setThinkingLevel(input.effort)
  }

  async setRecurrentDepth(input: { sessionId: string; recurrentDepth: number }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setRlmMaxDepth(input.recurrentDepth)
  }

  private async getReadyConnection(sessionId: string) {
    return (await this.getReadyAttachment(sessionId)).connection
  }

  private async getReadyAttachment(sessionId: string) {
    if (this.recoveryPromise) {
      const recoveryAvailability = checkPrimeAgentCommandAvailability<DaemonAgentConnection>({
        sessionId,
        recoveryActive: true,
        transportStatus: "reconnecting",
        connection: undefined,
      })
      if (!recoveryAvailability.ok) throw recoveryAvailability.error
    }

    const attachment = await this.getAttachment(sessionId)
    const availability = checkPrimeAgentCommandAvailability({
      sessionId,
      recoveryActive: this.recoveryPromise !== undefined,
      transportStatus: attachment.snapshot.transport.status,
      connection: attachment.connection,
    })
    if (!availability.ok) throw availability.error
    return { attachment, connection: availability.connection }
  }

  private async nameDraftSessionFromPrompt(
    attachment: SessionAttachment,
    connection: DaemonAgentConnection,
    prompt: string,
  ) {
    if (
      attachment.snapshot.session.lifecycle !== "draft" ||
      !isGenericSessionName(attachment.snapshot.session.name)
    ) return

    const derivedName = deriveSessionName(prompt)
    if (!derivedName) return

    try {
      await this.refreshSessionCatalog()
      const name = chooseAvailableSessionName(derivedName, this.catalogSessions)
      if (!name) return
      await connection.setSessionName(name)
    } catch {
      // A display-name failure must never reject the user's prompt.
    }
  }

  private async getAttachment(sessionId: string) {
    const pending = this.attachmentPromises.get(sessionId)
    if (pending) return pending
    const existing = this.attachments.get(sessionId)
    if (existing?.connection) return existing

    // Reserve before cleanup or client acquisition can yield to another caller.
    const creation = Promise.resolve().then(async () => {
      if (existing) {
        await this.releaseAttachment(existing)
        if (this.attachments.get(sessionId) === existing) this.attachments.delete(sessionId)
      }
      const client = await this.getClient()
      // Recovery can install the attachment while client acquisition is pending.
      const recovered = this.attachments.get(sessionId)
      if (recovered?.connection) return recovered
      const attachment = await this.createAttachment(client, sessionId, existing?.snapshot, this.summaries.get(sessionId))
      this.installAttachment(attachment)
      return attachment
    })
    this.attachmentPromises.set(sessionId, creation)
    try {
      return await creation
    } finally {
      if (this.attachmentPromises.get(sessionId) === creation) this.attachmentPromises.delete(sessionId)
    }
  }

  private async createAttachment(
    client: DaemonClient,
    sessionId: string,
    previousSnapshot?: PrimeSessionSnapshot,
    previousSession?: PrimeSessionSummary,
  ) {
    const deadline = Date.now() + ATTACHMENT_STARTUP_TIMEOUT_MS
    let resumed = false

    // Native snapshot events carry the active ID before attach returns. Starting
    // with the logical ID can discard snapshot-begin and accept only its end.
    if (!this.sessionTargets.get(sessionId)?.activeSessionId) {
      const listed = requireSuccess(await client.request({ type: "list", all: true }))
      const session = readSessionList(listed).map(toCatalogSession).find((item) => item.summary.id === sessionId)
      if (session) this.sessionTargets.set(sessionId, session.target)
      if (!session?.target.activeSessionId) {
        await this.resumeSession(client, sessionId)
        resumed = true
      }
    }

    while (true) {
      try {
        return await this.createAttachmentOnce(
          client,
          sessionId,
          previousSnapshot,
          previousSession,
        )
      } catch (error) {
        if (!resumed && (isUnknownActiveSessionError(error) || isFailedSessionWorkerError(error))) {
          await this.resumeSession(client, sessionId)
          resumed = true
          continue
        }
        if (!isSessionWorkerStartingError(error) || Date.now() >= deadline) throw error
        await new Promise<void>((resolve) => setTimeout(resolve, ATTACHMENT_STARTUP_RETRY_MS))
      }
    }
  }

  private async createAttachmentOnce(
    client: DaemonClient,
    sessionId: string,
    previousSnapshot?: PrimeSessionSnapshot,
    previousSession?: PrimeSessionSummary,
  ) {
    let attachment: SessionAttachment | undefined
    let eventBeforeReady = false
    const activeSessionId = this.sessionTargets.get(sessionId)?.activeSessionId
    if (!activeSessionId) throw new Error("Prime Agent attachment requires an active session identity")
    const connection = new DaemonAgentConnection(client, activeSessionId, {
      closeClientOnDispose: false,
    })
    const unsubscribe = connection.subscribe((event) => {
      if (!attachment) {
        eventBeforeReady = true
        return
      }
      this.handleConnectionEvent(attachment, event)
    })

    try {
      await connection.attach()
      const initialSnapshot = await connection.getInitialSnapshot()
      const nativeState = readRecord(readRecord(initialSnapshot, "connection snapshot").state, "connection state")
      const snapshot = projectPrimeSessionSnapshot(
        enrichPrimeSessionSnapshot({
          snapshot: initialSnapshot,
          previous: previousSnapshot,
        }),
        previousSnapshot?.session ?? previousSession,
      )
      if (snapshot.session.id !== sessionId) {
        throw new Error("Prime Agent attached a different session than Ernie requested")
      }
      // Recovery must not depend on the first periodic catalog refresh winning this race.
      this.sessionTargets.set(sessionId, {
        activeSessionId: readString(nativeState.activeSessionId) ?? this.sessionTargets.get(sessionId)?.activeSessionId,
        sessionFile: readString(nativeState.sessionFile) ?? this.sessionTargets.get(sessionId)?.sessionFile,
      })
      attachment = {
        sessionId,
        generation: crypto.randomUUID(),
        revision: 0,
        snapshot,
        connection,
        unsubscribe,
        refreshTimer: undefined,
        refreshTail: Promise.resolve(),
        refreshFailureCount: 0,
        needsRefresh: eventBeforeReady,
        disposed: false,
      }
      this.summaries.set(sessionId, snapshot.session)
      this.upsertCatalogSession(snapshot.session)
      return attachment
    } catch (error) {
      unsubscribe()
      await connection.dispose().catch(() => undefined)
      throw error
    }
  }

  private installAttachment(attachment: SessionAttachment) {
    this.attachments.set(attachment.sessionId, attachment)
    if (attachment.needsRefresh) {
      attachment.needsRefresh = false
      this.scheduleRefresh(attachment, true)
    }
  }

  private handleConnectionEvent(
    attachment: SessionAttachment,
    event: AgentConnectionEvent,
  ) {
    if (this.attachments.get(attachment.sessionId) !== attachment) {
      attachment.needsRefresh = true
      return
    }
    if (event.type === "closed") {
      if (!this.recoveryPromise) this.beginRecovery()
      return
    }
    if (event.type === "connection_status" && event.status === "reconnecting") {
      this.updateProjectedSnapshot(attachment, {
        ...attachment.snapshot,
        transport: { status: "reconnecting", error: "Prime Agent is reconnecting" },
      })
      return
    }
    if (event.type === "session_resynced") {
      this.replaceAttachmentSnapshot(attachment, event.snapshot)
      return
    }
    const coalesce = event.type === "session_event" && (
      event.event.type === "message_update" || event.event.type === "bash_output"
    )
    this.scheduleRefresh(attachment, !coalesce)
  }

  private replaceAttachmentSnapshot(
    attachment: SessionAttachment,
    input: unknown,
  ) {
    try {
      const snapshot = projectPrimeSessionSnapshot(
        enrichPrimeSessionSnapshot({ snapshot: input, previous: attachment.snapshot }),
        attachment.snapshot.session,
      )
      attachment.generation = crypto.randomUUID()
      attachment.revision = 0
      attachment.snapshot = snapshot
      this.summaries.set(attachment.sessionId, snapshot.session)
      this.upsertCatalogSession(snapshot.session)
      this.emitSnapshot(attachment)
    } catch {
      this.failAttachment(attachment)
    }
  }

  private scheduleRefresh(attachment: SessionAttachment, immediate: boolean) {
    if (attachment.disposed) return
    if (this.attachments.get(attachment.sessionId) !== attachment) {
      attachment.needsRefresh = true
      return
    }
    if (!immediate && attachment.refreshTimer) return
    if (immediate && attachment.refreshTimer) {
      clearTimeout(attachment.refreshTimer)
      attachment.refreshTimer = undefined
    }

    const refresh = () => {
      attachment.refreshTimer = undefined
      const run = attachment.refreshTail.then(() => this.refreshAttachment(attachment))
      attachment.refreshTail = run.then(
        () => {
          attachment.refreshFailureCount = 0
        },
        () => {
          attachment.refreshFailureCount += 1
          if (attachment.refreshFailureCount <= MAX_REFRESH_FAILURES) {
            this.scheduleRefresh(attachment, false)
          } else {
            attachment.refreshFailureCount = 0
            this.beginRecovery()
          }
        },
      )
    }
    if (immediate) {
      refresh()
    } else {
      attachment.refreshTimer = setTimeout(refresh, STREAM_REFRESH_INTERVAL_MS)
    }
  }

  private async refreshAttachment(attachment: SessionAttachment) {
    const connection = attachment.connection
    if (
      attachment.disposed ||
      this.attachments.get(attachment.sessionId) !== attachment ||
      !connection
    ) {
      return
    }

    const generation = attachment.generation
    const snapshot = await projectCurrentPrimeSessionRefresh({
      readSnapshot: async () => enrichPrimeSessionSnapshot({
        snapshot: await connection.getInitialSnapshot(),
        previous: attachment.snapshot,
      }),
      previousSession: attachment.snapshot.session,
      isCurrent: () =>
        !attachment.disposed &&
        this.attachments.get(attachment.sessionId) === attachment &&
        attachment.connection === connection &&
        attachment.generation === generation,
    })
    if (!snapshot) return
    this.updateProjectedSnapshot(attachment, snapshot)
  }

  private updateProjectedSnapshot(
    attachment: SessionAttachment,
    snapshot: PrimeSessionSnapshot,
  ) {
    const changes = diffPrimeSessionSnapshots(attachment.snapshot, snapshot)
    if (changes.length === 0) return

    attachment.snapshot = snapshot
    this.summaries.set(attachment.sessionId, snapshot.session)
    this.upsertCatalogSession(snapshot.session)
    for (const change of changes) {
      attachment.revision += 1
      const envelope: PrimeSessionChangeEnvelope = {
        sessionId: attachment.sessionId,
        generation: attachment.generation,
        revision: attachment.revision,
        change,
      }
      const parsed = parsePrimeSessionChangeEnvelope(envelope)
      if (!parsed.ok) throw parsed.error
      this.ctx.rpc.emit.app.primeSessionChanged(parsed.value)
    }
  }

  private emitSnapshot(attachment: SessionAttachment) {
    const parsed = parsePrimeSessionSnapshotEnvelope(snapshotEnvelope(attachment))
    if (!parsed.ok) throw parsed.error
    this.ctx.rpc.emit.app.primeSessionSnapshot(parsed.value)
  }

  private refreshSessionCatalog() {
    if (this.catalogRefresh) return this.catalogRefresh
    const refresh = this.readSessionCatalog()
    this.catalogRefresh = refresh
    return refresh.finally(() => {
      if (this.catalogRefresh === refresh) this.catalogRefresh = undefined
    })
  }

  private async readSessionCatalog() {
    const data = await this.request({ type: "list", all: true })
    if (this.disposed) return
    const catalog = readSessionList(data).map(toCatalogSession)
    const listedSessions = catalog.map(({ summary }) => summary)
    const sessions = listedSessions.map((session) => {
      const attached = this.attachments.get(session.id)?.snapshot.session
      return attached ? { ...attached, activitySummary: session.activitySummary, activityAt: session.activityAt, workerFailed: session.workerFailed, ...(session.state === "recovering" ? { state: session.state } : {}) } : session
    })
    this.sessionTargets.clear()
    for (const { summary, target } of catalog) this.sessionTargets.set(summary.id, target)
    this.summaries.clear()
    for (const session of sessions) this.summaries.set(session.id, session)
    this.replaceCatalogSessions(sessions)
  }

  private async resumeSession(client: DaemonClient, sessionId: string) {
    let sessionFile = this.sessionTargets.get(sessionId)?.sessionFile
    if (!sessionFile) {
      // Use this client directly: getClient waits for the recovery that called us.
      const listed = requireSuccess(await client.request({ type: "list", all: true }))
      const saved = readSessionList(listed).map(toCatalogSession).find((item) => item.summary.id === sessionId)
      if (saved) this.sessionTargets.set(sessionId, saved.target)
      sessionFile = saved?.target.sessionFile
    }
    if (!sessionFile) throw new Error(`Prime Agent session ${sessionId} cannot be resumed`)

    const roster = await Effect.runPromise(this.ctx.agentStore.read())
    const origin = roster.associations.find((item) => item.sessionId === sessionId)?.origin
    const resumed = requireSuccess(await client.request(
      { type: "create", sessionPath: sessionFile, ...(origin ? { config: nativeConversationConfig(origin, true) } : {}) },
      CREATE_SESSION_TIMEOUT_MS,
    ))
    const { summary, target } = toCatalogSession(readRecord(resumed, "resume response"))
    if (summary.id !== sessionId || !target.activeSessionId) {
      throw new Error("Prime Agent resumed a different session than Ernie requested")
    }
    this.summaries.set(sessionId, summary)
    this.sessionTargets.set(sessionId, target)
    this.upsertCatalogSession(summary)
  }

  private upsertCatalogSession(session: PrimeSessionSummary) {
    const index = this.catalogSessions.findIndex(({ id }) => id === session.id)
    if (index === -1) {
      this.replaceCatalogSessions([...this.catalogSessions, session])
      return
    }
    if (sameSessionSummary(this.catalogSessions[index], session)) return
    this.replaceCatalogSessions(this.catalogSessions.map((existing) =>
      existing.id === session.id ? session : existing))
  }

  private replaceCatalogSessions(sessions: readonly PrimeSessionSummary[]) {
    const selectedSessionId = this.selectedSessionId &&
      sessions.some(({ id }) => id === this.selectedSessionId)
      ? this.selectedSessionId
      : undefined
    if (
      sameSessionCatalog(this.catalogSessions, sessions) &&
      selectedSessionId === this.selectedSessionId
    ) return
    this.catalogSessions = sessions
    this.selectedSessionId = selectedSessionId
    this.publishSessionState()
  }

  private publishSessionState() {
    this.stateRevision += 1
    this.ctx.rpc.emit.app.primeSessionStateChanged(this.sessionState())
  }

  private sessionState(): PrimeSessionState {
    return {
      revision: this.stateRevision,
      ...(this.selectedSessionId ? { selectedSessionId: this.selectedSessionId } : {}),
      sessions: this.catalogSessions,
    }
  }

  private failAttachment(attachment: SessionAttachment, duringRecovery = false) {
    if (attachment.disposed || (this.recoveryPromise && !duringRecovery)) return
    this.updateProjectedSnapshot(attachment, {
      ...attachment.snapshot,
      session: { ...attachment.snapshot.session, state: "recovering" },
      transport: { status: "failed", error: "Prime Agent connection failed" },
    })
  }

  private beginRecovery() {
    this.recoveryRequested = true
    if (this.disposed || this.recoveryPromise) return
    const recovery = this.recoverUntilReady()
    const tracked = recovery.finally(() => {
      if (this.recoveryPromise === tracked) this.recoveryPromise = undefined
      if (this.recoveryRequested && !this.disposed) this.beginRecovery()
    })
    this.recoveryPromise = tracked
  }

  private async recoverUntilReady() {
    await runPrimeAgentRecoveryLoop({
      attempt: async () => {
        this.recoveryRequested = false
        const recovered = await this.recoverAttachments().catch(() => {
          this.failAllAttachments()
          return false
        })
        const ready = recovered && !this.recoveryRequested && this.client?.isConnected === true
        if (ready) this.recoveryRetry.clear()
        return ready
      },
      shouldStop: () => this.disposed,
      wait: () => this.recoveryRetry.wait(),
    })
  }

  private async recoverAttachments() {
    const previous = [...this.attachments.values()]
    for (const attachment of previous) {
      this.updateProjectedSnapshot(attachment, {
        ...attachment.snapshot,
        session: { ...attachment.snapshot.session, state: "recovering" },
        transport: { status: "reconnecting", error: "Prime Agent is reconnecting" },
      })
    }

    await Promise.allSettled(previous.map((attachment) => this.releaseAttachment(attachment)))
    this.attachments.clear()
    let client: DaemonClient
    try {
      client = await this.replaceClient()
    } catch {
      this.installFailedAttachments(previous)
      return false
    }
    if (this.disposed) {
      client.close()
      return false
    }

    const replacements: SessionAttachment[] = []
    for (const oldAttachment of previous) {
      try {
        const attachment = await this.createAttachment(
          client,
          oldAttachment.sessionId,
          oldAttachment.snapshot,
        )
        if (this.disposed) {
          await this.releaseAttachment(attachment)
          await Promise.allSettled(replacements.map((replacement) =>
            this.releaseAttachment(replacement)
          ))
          return false
        }
        replacements.push(attachment)
      } catch {
        await Promise.allSettled(replacements.map((replacement) =>
          this.releaseAttachment(replacement)
        ))
        this.installFailedAttachments(previous)
        return false
      }
    }

    for (const attachment of replacements) {
      this.installAttachment(attachment)
      this.emitSnapshot(attachment)
    }
    return true
  }

  private installFailedAttachments(previous: readonly SessionAttachment[]) {
    if (this.disposed) return
    for (const oldAttachment of previous) {
      const failed = failedAttachment(oldAttachment)
      this.installAttachment(failed)
      this.emitSnapshot(failed)
    }
  }

  private failAllAttachments() {
    for (const attachment of this.attachments.values()) {
      this.failAttachment(attachment, true)
    }
  }

  private async releaseAttachment(attachment: SessionAttachment) {
    if (attachment.disposed) return
    attachment.disposed = true
    if (attachment.refreshTimer) clearTimeout(attachment.refreshTimer)
    attachment.refreshTimer = undefined
    attachment.unsubscribe()
    await attachment.refreshTail.catch(() => undefined)
    await attachment.connection?.dispose().catch(() => undefined)
    attachment.connection = undefined
  }

  private async request(command: CommandBody, timeoutMs = 30_000) {
    const client = await this.getClient()
    return requireSuccess(await client.request(command, timeoutMs))
  }

  private async getClient() {
    if (this.recoveryPromise) await this.recoveryPromise
    if (this.client?.isConnected) return this.client
    if (this.connecting) return this.connecting

    const connecting = this.openClient()
    this.connecting = connecting
    try {
      const client = await connecting
      if (this.disposed) {
        client.close()
        throw new Error("Prime Agent service is shutting down")
      }
      this.installClient(client)
      return client
    } finally {
      if (this.connecting === connecting) this.connecting = undefined
    }
  }

  private async replaceClient() {
    this.detachClient()
    const client = await this.openClient()
    this.installClient(client)
    return client
  }

  private installClient(client: DaemonClient) {
    this.detachClient()
    this.client = client
    this.unsubscribeClientClose = client.onClose(() => this.beginRecovery())
  }

  private detachClient() {
    this.unsubscribeClientClose?.()
    this.unsubscribeClientClose = undefined
    this.client?.close()
    this.client = undefined
  }

  private async openClient() {
    try {
      return await connectClient(this.endpoint.socketPath)
    } catch (cause) {
      if (this.endpoint.ownership === "external") {
        throw new Error("The configured Prime Agent socket is unavailable", { cause })
      }
      startDaemon(this.endpoint)
      const deadline = Date.now() + 10_000
      let lastError: unknown
      while (Date.now() < deadline) {
        try {
          return await connectClient(this.endpoint.socketPath)
        } catch (error) {
          lastError = error
          await delay(150)
        }
      }
      throw new Error("Prime Agent daemon did not become ready", { cause: lastError })
    }
  }

  private async disposeRuntime() {
    if (this.disposed) return
    this.disposed = true
    const recovery = this.recoveryPromise
    this.recoveryRetry.clear()
    const attachments = [...this.attachments.values()]
    this.attachments.clear()
    this.attachmentPromises.clear()
    await Promise.allSettled(attachments.map((attachment) => this.releaseAttachment(attachment)))
    await recovery?.catch(() => undefined)
    this.detachClient()
  }
}

function isSessionWorkerStartingError(error: unknown) {
  return error instanceof Error && error.message === "Session worker is starting"
}

function isFailedSessionWorkerError(error: unknown) {
  return error instanceof Error && error.message === "Session worker is failed"
}

function isUnknownActiveSessionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("Unknown active session:")
}

function snapshotEnvelope(attachment: SessionAttachment): PrimeSessionSnapshotEnvelope {
  return {
    sessionId: attachment.sessionId,
    generation: attachment.generation,
    revision: attachment.revision,
    snapshot: attachment.snapshot,
  }
}

function failedAttachment(previous: SessionAttachment): SessionAttachment {
  return {
    sessionId: previous.sessionId,
    generation: crypto.randomUUID(),
    revision: 0,
    snapshot: {
      ...previous.snapshot,
      session: { ...previous.snapshot.session, state: "recovering" },
      transport: { status: "failed", error: "Prime Agent connection failed" },
    },
    connection: undefined,
    unsubscribe: () => {},
    refreshTimer: undefined,
    refreshTail: Promise.resolve(),
    refreshFailureCount: 0,
    needsRefresh: false,
    disposed: false,
  }
}

async function connectClient(socketPath: string) {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect(500)
    await client.waitForHello(1_000)
    return client
  } catch (error) {
    client.close()
    throw error
  }
}

function startDaemon(config: Extract<PrimeAgentEndpoint, { ownership: "managed" }>) {
  mkdirSync(dirname(config.socketPath), { recursive: true })
  const packageEntry = import.meta.resolve("prime-agent")
  const cliPath = fileURLToPath(new URL("./bundle/cli.js", packageEntry))
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    ...(config.agentDir ? { PRIME_AGENT_CODING_AGENT_DIR: config.agentDir } : {}),
  }
  for (const name of PRIME_AGENT_DAEMON_WORKER_ENV) delete env[name]
  const child = spawn(
    config.executablePath,
    [cliPath, "--mode", "daemon", "--daemon-socket", config.socketPath],
    { detached: true, env, stdio: "ignore" },
  )
  child.unref()
}

function readPrimeAgentEndpoint(): PrimeAgentEndpoint {
  const socketOverride = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_SOCKET,
    "ERNIE_PRIME_AGENT_SOCKET",
  )
  if (socketOverride && process.env.ERNIE_PRIME_AGENT_START_DAEMON !== "1") {
    return { ownership: "external", socketPath: socketOverride }
  }

  const agentDir = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_AGENT_DIR,
    "ERNIE_PRIME_AGENT_AGENT_DIR",
  )
  const executablePath = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_EXECUTABLE,
    "ERNIE_PRIME_AGENT_EXECUTABLE",
  ) ?? process.execPath
  return {
    ownership: "managed",
    socketPath: socketOverride ?? join(
      homedir(),
      "Library",
      "Application Support",
      "Ernie",
      "prime-agent-v0.8.1.sock",
    ),
    agentDir,
    executablePath,
  }
}

function readAbsolutePath(value: string | undefined, name: string) {
  if (value === undefined) return undefined
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`)
  return value
}

function requireSuccess(response: DaemonResponse) {
  if (!response.success) throw new Error(response.error)
  return response.data
}

function readSessionList(value: unknown): Record<string, unknown>[] {
  const data = readRecord(value, "session list")
  if (!Array.isArray(data.sessions)) throw new Error("Prime Agent returned an invalid session list")
  return data.sessions.map((entry) => readRecord(entry, "session"))
}

function toCatalogSession(value: Record<string, unknown>): CatalogSession {
  const activeSessionId = readString(value.activeSessionId)
  const sessionFile = readString(value.sessionFile)
  const id = readString(value.sessionId) ?? readString(value.id) ?? activeSessionId
  const cwd = readString(value.cwd)
  if (!id || !cwd) throw new Error("Prime Agent returned an invalid session")
  const lifecycle = readLifecycle(value.lifecycle)
  const busy = lifecycle !== "draft" && (
    value.activity === "working" ||
    value.isStreaming === true ||
    value.isCompacting === true ||
    value.isBashRunning === true
  )
  return {
    summary: {
      id,
      cwd,
      name: readString(value.sessionName),
      lifecycle,
      state: value.workerState === "recovering" ? "recovering" : busy ? "working" : "idle",
      model: readModel(value.model),
      activitySummary: readString(value.summary),
      activityAt: readString(value.lastActivityAt) ?? readString(value.modified),
      workerFailed: value.workerState === "failed",
    },
    target: {
      ...(activeSessionId ? { activeSessionId } : {}),
      ...(sessionFile ? { sessionFile } : {}),
    },
  }
}

function readLifecycle(value: unknown): PrimeSessionSummary["lifecycle"] {
  if (value === "archived" || value === "draft" || value === "live") return value
  throw new Error("Prime Agent returned an invalid session lifecycle")
}

function sameSessionCatalog(
  left: readonly PrimeSessionSummary[],
  right: readonly PrimeSessionSummary[],
) {
  return left.length === right.length && left.every((session, index) =>
    sameSessionSummary(session, right[index]))
}

function sameSessionSummary(left: PrimeSessionSummary, right: PrimeSessionSummary | undefined) {
  return right !== undefined &&
    left.id === right.id &&
    left.cwd === right.cwd &&
    left.name === right.name &&
    left.lifecycle === right.lifecycle &&
    left.state === right.state &&
    left.activitySummary === right.activitySummary &&
    left.activityAt === right.activityAt &&
    left.workerFailed === right.workerFailed &&
    left.model?.id === right.model?.id &&
    left.model?.provider === right.model?.provider &&
    left.model?.label === right.model?.label
}

function readModel(value: unknown) {
  const model = asRecord(value)
  const id = readString(model?.id)
  const provider = readString(model?.provider)
  return id && provider ? { id, provider, label: readString(model?.name) ?? id } : undefined
}

function readRecord(value: unknown, label: string) {
  const record = asRecord(value)
  if (!record) throw new Error(`Prime Agent returned an invalid ${label}`)
  return record
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Option.getOrUndefined(Schema.decodeUnknownOption(recordSchema)(value))
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
