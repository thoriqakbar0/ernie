import { PrimeDaemonUnavailableError } from "./daemon-unavailable"
import { inspectNativeChild } from "./child-inspection"
import { InstalledPrimeDaemon, isPrimeDaemonAbsent } from "./installed-daemon"
import { readModelCatalog, projectModelCatalog } from "./model-catalog"
import { createHash } from "node:crypto"
import { readdir, mkdir, stat } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { Service } from "@zenbujs/core/runtime"
import { RpcService } from "@zenbujs/core/services"
import { Effect, Option, Schema } from "effect"
import { ConversationOrigin, decodeAgentInput } from "../../packages/agents"
import { nativeConversationConfig } from "./agent-config"
import {
  connectPrimeDaemon,
  IncompatiblePrimeDaemonError,
  existingDaemonSocketPath,
} from "./daemon-client"
import { AgentStoreService } from "../services/agent-store"
import { SessionManager, DaemonAgentConnection } from "prime-agent"
import type { DaemonClient, AgentConnectionEvent, DaemonCommand, DaemonResponse } from "prime-agent"

import { SendRequest, PrimeEffortSchema, PrimeRlmMaxDepthSchema } from "../../packages/prime-agent"
import type {
  PrimeDaemonConnection,
  PrimeSessionInspection,
  PrimeModel,
  PrimeSessionState,
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionSummary,
  SendReceipt,
} from "../../packages/prime-agent"
import {
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionSnapshotEnvelope,
} from "../../packages/prime-agent/sync"
import { diffPrimeSessionSnapshots, projectPrimeSessionSnapshot } from "./projection"
import { admitHistoryTurn } from "./history-admission"
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
import { createPrimeAgentRecoveryRetry, runPrimeAgentRecoveryLoop } from "./recovery-retry"

type CommandBody = DaemonCommand extends infer Command
  ? Command extends { id?: string }
    ? Omit<Command, "id">
    : never
  : never

type PrimeAgentEndpoint = Readonly<{
  autoStart: boolean
  ownership: "external"
  socketPath: string
}>

interface SessionAttachment {
  readonly sessionId: string
  generation: string
  revision: number
  snapshot: PrimeSessionSnapshot
  connection: DaemonAgentConnection | undefined
  unsubscribe: () => void
  refreshTimer: ReturnType<typeof setTimeout> | undefined
  refreshTail: Promise<void>
  refreshQueued: boolean
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
const RECOVERY_RETRY_INTERVAL_MS = 1000
const MAX_REFRESH_FAILURES = 2
const CREATE_SESSION_TIMEOUT_MS = 60_000
const CREATE_SESSION_NAME_RETRIES = 3
const ATTACHMENT_STARTUP_TIMEOUT_MS = 10_000
const ATTACHMENT_STARTUP_RETRY_MS = 100
const SESSION_CATALOG_REFRESH_MS = 1000
const recordSchema = Schema.Record(Schema.String, Schema.Unknown)

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(recordSchema)(value))

const readString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined

const readRecord = (value: unknown, label: string) => {
  const record = asRecord(value)
  if (!record) {
    throw new Error(`Prime Agent returned an invalid ${label}`)
  }
  return record
}

const readModel = (value: unknown) => {
  const model = asRecord(value)
  const id = readString(model?.id)
  const provider = readString(model?.provider)
  return id && provider ? { id, label: readString(model?.name) ?? id, provider } : undefined
}

const readLifecycle = (value: unknown): PrimeSessionSummary["lifecycle"] => {
  if (value === "archived" || value === "draft" || value === "live") {
    return value
  }
  throw new Error("Prime Agent returned an invalid session lifecycle")
}

const readAbsolutePath = (value: string | undefined, name: string) => {
  if (value === undefined) {
    return
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`)
  }
  return value
}

const requireSuccess = (response: DaemonResponse) => {
  if (!response.success) {
    throw new Error(response.error)
  }
  return response.data
}

const readSessionList = (value: unknown): Record<string, unknown>[] => {
  const data = readRecord(value, "session list")
  if (!Array.isArray(data.sessions)) {
    throw new TypeError("Prime Agent returned an invalid session list")
  }
  return data.sessions.map((entry) => readRecord(entry, "session"))
}

const toCatalogSession = (value: Record<string, unknown>): CatalogSession => {
  const activeSessionId = readString(value.activeSessionId)
  const sessionFile = readString(value.sessionFile)
  const id = readString(value.sessionId) ?? readString(value.id) ?? activeSessionId
  const cwd = readString(value.cwd)
  if (!id || !cwd) {
    throw new Error("Prime Agent returned an invalid session")
  }
  const lifecycle = readLifecycle(value.lifecycle)
  const busy =
    lifecycle !== "draft" &&
    (value.activity === "working" ||
      value.isStreaming === true ||
      value.isCompacting === true ||
      value.isBashRunning === true)
  let state: PrimeSessionSummary["state"] = busy ? "working" : "idle"
  if (value.workerState === "recovering") {
    state = "recovering"
  }
  return {
    summary: {
      activityAt: readString(value.lastActivityAt) ?? readString(value.modified),
      activitySummary: readString(value.summary),
      cwd,
      id,
      lifecycle,
      model: readModel(value.model),
      name: readString(value.sessionName),
      state,
      ...(typeof value.rlmDepth === "number" &&
      Number.isInteger(value.rlmDepth) &&
      value.rlmDepth >= 0
        ? { rlmDepth: value.rlmDepth }
        : {}),
      workerFailed: value.workerState === "failed",
    },
    target: {
      ...(activeSessionId ? { activeSessionId } : {}),
      ...(sessionFile ? { sessionFile } : {}),
    },
  }
}

const sameSessionSummary = (left: PrimeSessionSummary, right: PrimeSessionSummary | undefined) =>
  right !== undefined &&
  left.id === right.id &&
  left.cwd === right.cwd &&
  left.name === right.name &&
  left.lifecycle === right.lifecycle &&
  left.state === right.state &&
  left.activitySummary === right.activitySummary &&
  left.activityAt === right.activityAt &&
  left.workerFailed === right.workerFailed &&
  left.rlmDepth === right.rlmDepth &&
  left.model?.id === right.model?.id &&
  left.model?.provider === right.model?.provider &&
  left.model?.label === right.model?.label

const sameSessionCatalog = (
  left: readonly PrimeSessionSummary[],
  right: readonly PrimeSessionSummary[],
) =>
  left.length === right.length &&
  left.every((session, index) => sameSessionSummary(session, right[index]))

const snapshotEnvelope = (attachment: SessionAttachment): PrimeSessionSnapshotEnvelope => ({
  generation: attachment.generation,
  revision: attachment.revision,
  sessionId: attachment.sessionId,
  snapshot: attachment.snapshot,
})

const failedAttachment = (previous: SessionAttachment): SessionAttachment => ({
  connection: undefined,
  disposed: false,
  generation: crypto.randomUUID(),
  needsRefresh: false,
  refreshFailureCount: 0,
  refreshQueued: false,
  refreshTail: Promise.resolve(),
  refreshTimer: undefined,
  revision: 0,
  sessionId: previous.sessionId,
  snapshot: {
    ...previous.snapshot,
    session: { ...previous.snapshot.session, state: "recovering" },
    transport: { error: "Prime Agent connection failed", status: "failed" },
  },
  unsubscribe: () => {
    // Failed attachments have no subscription to release.
  },
})

const isSessionWorkerStartingError = (error: unknown) =>
  error instanceof Error && error.message === "Session worker is starting"

const isFailedSessionWorkerError = (error: unknown) =>
  error instanceof Error && error.message === "Session worker is failed"

const isUnknownActiveSessionError = (error: unknown) =>
  error instanceof Error && error.message.startsWith("Unknown active session:")

const readPrimeAgentEndpoint = (): PrimeAgentEndpoint => ({
  autoStart:
    Schema.decodeUnknownSync(Schema.Literals(["0", "1"]))(
      process.env.ERNIE_PRIME_AGENT_START_DAEMON ?? "1",
    ) === "1",
  ownership: "external",
  socketPath:
    readAbsolutePath(process.env.ERNIE_PRIME_AGENT_SOCKET, "ERNIE_PRIME_AGENT_SOCKET") ??
    existingDaemonSocketPath(),
})

// @lat: [[architecture#Prime Agent boundary]]
/** Owns Ernie's shared Prime Agent daemon client and logical session attachments. */
export class PrimeAgentService extends Service.create({
  deps: { agentStore: AgentStoreService, rpc: RpcService },
  key: "primeAgent",
}) {
  private readonly sendReceipts = new SendReceipts()
  private readonly endpoint = readPrimeAgentEndpoint()
  private readonly installedDaemon = new InstalledPrimeDaemon()
  private launchAttempted = false
  private readonly attachments = new Map<string, SessionAttachment>()
  private readonly attachmentPromises = new Map<string, Promise<SessionAttachment>>()
  private readonly summaries = new Map<string, PrimeSessionSummary>()
  private readonly sessionTargets = new Map<string, SessionTarget>()
  private stateRevision = 0
  private selectedSessionId: string | undefined
  private catalogSessions: readonly PrimeSessionSummary[] = []
  private catalogRefresh: Promise<void> | undefined
  private client: DaemonClient | undefined
  private connection: PrimeDaemonConnection = {
    socketPath: this.endpoint.socketPath,
    state: { status: "disconnected" },
  }
  private unsubscribeClientClose: (() => void) | undefined
  private recoveryPromise: Promise<void> | undefined
  private readonly recoveryRetry = createPrimeAgentRecoveryRetry(RECOVERY_RETRY_INTERVAL_MS)
  private recoveryRequested = false
  private disposed = false

  /** Registers one cleanup owner for every Prime Agent resource. */
  evaluate() {
    this.setup("prime-agent-runtime", () => {
      this.beginRecovery()
      return () => this.disposeRuntime()
    })
    this.setup("prime-agent-catalog", () => {
      const timer = setInterval(async () => {
        if (this.connection.state.status === "connected" && !this.recoveryPromise) {
          await this.refreshConnectedCatalog()
        }
      }, SESSION_CATALOG_REFRESH_MS)
      return () => clearInterval(timer)
    })
  }

  /** Reads the newest authoritative session state. */
  async getSessionState(): Promise<PrimeSessionState> {
    this.requireActiveRuntime()
    if (this.connection.state.status === "connected" && !this.recoveryPromise) {
      await this.refreshConnectedCatalog()
    }
    return this.sessionState()
  }

  /** Explicitly connects to the configured external daemon; concurrent clicks share recovery. */
  async connectDaemon(): Promise<PrimeSessionState> {
    this.requireActiveRuntime()
    const hasFailedAttachment = [...this.attachments.values()].some(
      (attachment) => attachment.snapshot.transport.status !== "connected",
    )
    if (
      !this.recoveryPromise &&
      (this.connection.state.status !== "connected" || hasFailedAttachment)
    ) {
      this.beginRecovery()
    }
    await this.recoveryPromise
    return this.getSessionState()
  }

  /** Selects the session displayed by Ernie, or clears selection. */
  async selectSession(input: { sessionId?: string }) {
    const sessionId = input.sessionId?.trim()
    if (sessionId && !this.catalogSessions.some(({ id }) => id === sessionId)) {
      throw new Error("The selected Prime Agent session is unavailable")
    }
    if (
      sessionId &&
      (!this.sessionTargets.get(sessionId)?.activeSessionId ||
        this.summaries.get(sessionId)?.workerFailed)
    ) {
      await this.resumeSession(await this.getClient(), sessionId)
    }
    if (sessionId === this.selectedSessionId) {
      return
    }
    this.selectedSessionId = sessionId
    this.publishSessionState()
  }

  /** Materializes a stable saved root before any daemon request can have an uncertain outcome. */
  async prepareAgentRoot(input: { agentId: string; cwd: string; name: string }) {
    const directoryStat = path.isAbsolute(input.cwd) ? await stat(input.cwd) : undefined
    if (!directoryStat?.isDirectory()) {
      throw new Error("Choose an existing folder for your Agent.")
    }
    const directory = path.join(
      this.ctx.agentStore.rootDirectory(),
      createHash("sha256").update(input.agentId).digest("hex"),
    )
    await mkdir(directory, { recursive: true })
    const entries = await readdir(directory)
    const files = entries.filter((file) => file.endsWith(".jsonl"))
    if (files.length > 1) {
      throw new Error("Multiple saved roots need recovery before this Agent can open.")
    }
    const manager = files[0]
      ? SessionManager.open(path.join(directory, files[0]))
      : SessionManager.create(input.cwd, directory)
    if (!files.length) {
      manager.appendSessionInfo(input.name)
      manager.flushNow()
    }
    const sessionFile = manager.getSessionFile()
    if (!sessionFile) {
      throw new Error("Prime Agent could not prepare a durable session.")
    }
    return { sessionFile, sessionId: manager.getSessionId(), status: "prepared" as const }
  }

  /** Checks durable identity and root classification without opening or replacing a runtime. */
  async inspectAgentRoot(input: { sessionId: string; sessionFile?: string }) {
    await this.refreshSessionCatalog()
    const sessionFile = input.sessionFile ?? this.sessionTargets.get(input.sessionId)?.sessionFile
    if (!sessionFile) {
      throw new Error(
        "This saved Agent is unavailable. Reconnect or restore its original session file.",
      )
    }
    await stat(sessionFile)
    const manager = SessionManager.open(sessionFile)
    if (manager.getSessionId() !== input.sessionId || (manager.getHeader()?.rlmDepth ?? 0) > 0) {
      throw new Error("This session is not the requested native root.")
    }
    return {
      cwd: manager.getCwd(),
      name: this.summaries.get(input.sessionId)?.name ?? manager.getSessionName(),
      sessionFile,
      sessionId: input.sessionId,
    }
  }

  /** Repeated activation opens the same saved root; the native session lease owns admission. */
  async activateAgentRoot(input: {
    sessionId: string
    sessionFile: string
    name: string
    origin?: ConversationOrigin
    prepared: boolean
  }) {
    await this.inspectAgentRoot(input)
    const active = this.sessionTargets.get(input.sessionId)
    if (!active?.activeSessionId || this.summaries.get(input.sessionId)?.workerFailed) {
      const created = await this.request(
        {
          sessionPath: input.sessionFile,
          type: "create",
          ...(input.prepared ? { name: input.name } : {}),
          ...(input.origin
            ? { config: nativeConversationConfig(input.origin, !input.prepared) }
            : {}),
          lifecycle: "resident",
        },
        CREATE_SESSION_TIMEOUT_MS,
      )
      const { summary, target } = toCatalogSession(readRecord(created, "root activation"))
      if (summary.id !== input.sessionId) {
        throw new Error("Prime Agent opened a different root. The saved binding was kept.")
      }
      this.sessionTargets.set(summary.id, target)
      this.summaries.set(summary.id, summary)
      this.upsertCatalogSession(summary)
    }
    await this.selectSession({ sessionId: input.sessionId })
    if (input.prepared && input.origin?.rlmMaxDepth !== undefined) {
      await this.setRecurrentDepth({
        recurrentDepth: input.origin.rlmMaxDepth,
        sessionId: input.sessionId,
      })
    }
    return this.summaries.get(input.sessionId)
  }

  /** Renames only the bound native root, preserving native collision checks. */
  async renameAgentRoot(input: {
    sessionId: string
    sessionFile: string
    name: string
    expectedName?: string
  }) {
    const current = await this.inspectAgentRoot(input)
    if (current.name === input.name) {
      return
    }
    if (input.expectedName !== undefined && current.name !== input.expectedName) {
      throw new Error("The native name changed elsewhere. Reopen Customize before renaming.")
    }
    const activeSessionId = this.sessionTargets.get(input.sessionId)?.activeSessionId
    await this.request(
      activeSessionId
        ? { activeSessionId, name: input.name, type: "rename" }
        : { name: input.name, sessionPath: input.sessionFile, type: "rename_saved_session" },
    )
    await this.refreshSessionCatalog()
  }

  /** Creates one resident Prime Agent session without attaching a renderer. */
  async createSession(input: {
    cwd: string
    name?: string
    origin?: ConversationOrigin
    creationId?: string
  }) {
    const origin = input.origin
      ? await Effect.runPromise(decodeAgentInput(ConversationOrigin, input.origin))
      : undefined
    const data = await this.request({ all: true, type: "list" })
    const knownSessions = readSessionList(data).map((entry) => toCatalogSession(entry).summary)
    const rejectedNames = new Set<string>()
    let lastCollision: unknown

    const attemptCreation = async (attempt: number): Promise<PrimeSessionSummary> => {
      if (attempt > CREATE_SESSION_NAME_RETRIES) {
        throw new Error("Prime Agent session name stayed unavailable after retries", {
          cause: lastCollision,
        })
      }
      const name = chooseAvailableSessionName(input.name, knownSessions, rejectedNames)
      try {
        const created = await this.request(
          {
            config: origin ? nativeConversationConfig(origin) : { cwd: input.cwd },
            lifecycle: "resident",
            name,
            type: "create",
          },
          CREATE_SESSION_TIMEOUT_MS,
        )
        const { summary: session, target } = toCatalogSession(
          readRecord(created, "create response"),
        )
        this.summaries.set(session.id, session)
        this.sessionTargets.set(session.id, target)
        this.upsertCatalogSession(session)
        if (origin) {
          await Effect.runPromise(
            Effect.gen({ self: this }, function* saveAssociation() {
              const roster = yield* this.ctx.agentStore.read()
              yield* this.ctx.agentStore.write({
                ...roster,
                associations: [
                  ...roster.associations,
                  {
                    sessionId: session.id,
                    ...(input.creationId ? { creationId: input.creationId } : {}),
                    agentId: null,
                    origin,
                    visitedAt: Date.now(),
                  },
                ],
              })
            }),
          )
        }
        if (origin?.rlmMaxDepth !== undefined) {
          await this.setRecurrentDepth({
            recurrentDepth: origin.rlmMaxDepth,
            sessionId: session.id,
          })
        }
        return session
      } catch (error) {
        if (!name || !isUnavailableSessionNameError(error, name)) {
          throw error
        }
        rejectedNames.add(name)
        lastCollision = error
      }
      return attemptCreation(attempt + 1)
    }
    return attemptCreation(0)
  }

  /** Attaches one logical connection and returns its current projected snapshot. */
  async attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope> {
    if (this.recoveryPromise) {
      await this.recoveryPromise
    }
    return snapshotEnvelope(await this.getAttachment(input.sessionId))
  }

  /** Inspects a child admitted by this parent, without sending, resuming, or replacing it. */
  async inspectChild(input: {
    parentSessionId: string
    childId: string
  }): Promise<PrimeSessionInspection> {
    const parent = await this.getAttachment(input.parentSessionId)
    if (parent.snapshot.transport.status !== "connected") {
      throw new Error("Reconnect the parent to inspect its subagents.")
    }
    return inspectNativeChild({
      childId: input.childId,
      children: parent.snapshot.useful.children,
      parent: {
        sessionFile: this.sessionTargets.get(input.parentSessionId)?.sessionFile,
        sessionId: input.parentSessionId,
      },
      readLive: async (activeSessionId) => {
        const connection = new DaemonAgentConnection(await this.getClient(), activeSessionId, {
          closeClientOnDispose: false,
        })
        try {
          await connection.attach()
          return projectPrimeSessionSnapshot(
            enrichPrimeSessionSnapshot({ snapshot: await connection.getInitialSnapshot() }),
          )
        } finally {
          await connection.dispose()
        }
      },
    })
  }

  /** Returns the identity of this in-memory receipt owner. */
  getSendEpoch(): Promise<string> {
    return Promise.resolve(this.sendReceipts.epoch)
  }

  /** Inspects a receipt without attaching to the daemon or dispatching a message. */
  checkSend(input: SendRequest): Promise<SendReceipt> {
    try {
      return Promise.resolve(this.sendReceipts.check(Schema.decodeUnknownSync(SendRequest)(input)))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  /** Reserves an immutable send before entering the native transport. */
  async sendMessage(input: SendRequest): Promise<SendReceipt> {
    const request = Schema.decodeUnknownSync(SendRequest)(input)
    return await this.sendReceipts.send(request, async () => {
      const { attachment, connection } = await this.getReadyAttachment(request.sessionId)
      // Admission is the last preparation step: earlier failures cannot orphan an edit interval.
      const prepareHistory = async () => {
        const history = await admitHistoryTurn(
          attachment.snapshot.session.cwd,
          `${request.epoch}:${request.commandId}`,
        )
        return {
          content: request.content + (history?.context ?? ""),
          finish: () => {
            if (history) {
              const finishHistory = async () => {
                try {
                  await connection.waitForIdle()
                  await history.finish()
                } catch {
                  console.warn(
                    "Ernie customization capture remains incomplete; inspect App history.",
                  )
                }
              }
              void finishHistory()
            }
          },
        }
      }
      if (request.mode === "prompt") {
        await this.nameDraftSessionFromPrompt(attachment, connection, request.content)
        const history = await prepareHistory()
        return async () => {
          // A rejected transport promise has uncertain delivery, so retain protection until resolved.
          await connection.prompt(history.content, { source: "interactive" })
          history.finish()
          return { status: "accepted" }
        }
      }
      const [state, client] = await Promise.all([connection.getState(), this.getClient()])
      const { activeSessionId } = Schema.decodeUnknownSync(
        Schema.Struct({ activeSessionId: Schema.NonEmptyString }),
      )(state)
      const history = await prepareHistory()
      return async () => {
        // The native convenience wrapper discards queued:false for a coalesced follow-up.
        const response = requireSuccess(
          await client.request({ activeSessionId, message: history.content, type: "follow_up" }),
        )
        const { queued } = Schema.decodeUnknownSync(Schema.Struct({ queued: Schema.Boolean }))(
          response,
        )
        history.finish()
        return queued
          ? { status: "queued" }
          : {
              message:
                "Prime Agent already has an equivalent follow-up pending. This message was not added again.",
              status: "not-sent",
            }
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
  async getModels(input: { sessionId?: string; all?: boolean }): Promise<readonly PrimeModel[]> {
    if (!input.sessionId) {
      return readModelCatalog(input.all)
    }
    const connection = await this.getReadyConnection(input.sessionId)
    const models = await connection.getAvailableModels()
    return projectModelCatalog(models)
  }

  /** Changes the model through the owning logical attachment. */
  async setModel(input: { sessionId: string; provider: string; modelId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setModel(input.provider, input.modelId)
    const attachment = this.attachments.get(input.sessionId)
    if (attachment) {
      this.scheduleRefresh(attachment, true)
    }
  }

  async getRecurrentDepth(input: { sessionId: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    const status = await connection.getRlmMaxDepthStatus()
    return status.maxDepth
  }

  async setEffort(input: {
    sessionId: string
    effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"
  }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setThinkingLevel(Schema.decodeUnknownSync(PrimeEffortSchema)(input.effort))
    const attachment = this.attachments.get(input.sessionId)
    if (attachment) {
      this.scheduleRefresh(attachment, true)
    }
  }

  async setRecurrentDepth(input: { sessionId: string; recurrentDepth: number }) {
    const depth = Schema.decodeUnknownSync(PrimeRlmMaxDepthSchema)(input.recurrentDepth)
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.setRlmMaxDepth(depth)
  }

  private async getReadyConnection(sessionId: string) {
    const attachment = await this.getReadyAttachment(sessionId)
    return attachment.connection
  }

  private async getReadyAttachment(sessionId: string) {
    if (this.recoveryPromise) {
      const recoveryAvailability = checkPrimeAgentCommandAvailability<DaemonAgentConnection>({
        connection: undefined,
        recoveryActive: true,
        sessionId,
        transportStatus: "reconnecting",
      })
      if (!recoveryAvailability.ok) {
        throw recoveryAvailability.error
      }
    }

    const attachment = await this.getAttachment(sessionId)
    const availability = checkPrimeAgentCommandAvailability({
      connection: attachment.connection,
      recoveryActive: this.recoveryPromise !== undefined,
      sessionId,
      transportStatus: attachment.snapshot.transport.status,
    })
    if (!availability.ok) {
      throw availability.error
    }
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
    ) {
      return
    }

    const roster = await Effect.runPromise(this.ctx.agentStore.read())
    if (roster.agents.some((agent) => agent.root?.sessionId === attachment.sessionId)) {
      return
    }
    const derivedName = deriveSessionName(prompt)
    if (!derivedName) {
      return
    }

    try {
      await this.refreshSessionCatalog()
      const name = chooseAvailableSessionName(derivedName, this.catalogSessions)
      if (!name) {
        return
      }
      await connection.setSessionName(name)
    } catch {
      // A display-name failure must never reject the user's prompt.
    }
  }

  private async getAttachment(sessionId: string) {
    this.requireActiveRuntime()
    const pending = this.attachmentPromises.get(sessionId)
    if (pending) {
      return pending
    }
    const existing = this.attachments.get(sessionId)
    if (existing?.connection) {
      return existing
    }

    // Reserve before cleanup or client acquisition can yield to another caller.
    const creation = (async () => {
      await Promise.resolve()
      if (existing) {
        await PrimeAgentService.releaseAttachment(existing)
        if (this.attachments.get(sessionId) === existing) {
          this.attachments.delete(sessionId)
        }
      }
      const client = await this.getClient()
      this.requireActiveRuntime()
      // Recovery can install the attachment while client acquisition is pending.
      const recovered = this.attachments.get(sessionId)
      if (recovered?.connection) {
        return recovered
      }
      const attachment = await this.createAttachment(
        client,
        sessionId,
        existing?.snapshot,
        this.summaries.get(sessionId),
      )
      if (this.disposed) {
        await PrimeAgentService.releaseAttachment(attachment)
        this.requireActiveRuntime()
      }
      this.installAttachment(attachment)
      return attachment
    })()
    this.attachmentPromises.set(sessionId, creation)
    try {
      return await creation
    } finally {
      if (this.attachmentPromises.get(sessionId) === creation) {
        this.attachmentPromises.delete(sessionId)
      }
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
      const listed = requireSuccess(await client.request({ all: true, type: "list" }))
      const session = readSessionList(listed)
        .map(toCatalogSession)
        .find((item) => item.summary.id === sessionId)
      if (session) {
        this.sessionTargets.set(sessionId, session.target)
      }
      if (!session?.target.activeSessionId) {
        await this.resumeSession(client, sessionId)
        resumed = true
      }
    }

    const attemptAttachment = async (): Promise<SessionAttachment> => {
      try {
        return await this.createAttachmentOnce(client, sessionId, previousSnapshot, previousSession)
      } catch (error) {
        if (!resumed && (isUnknownActiveSessionError(error) || isFailedSessionWorkerError(error))) {
          await this.resumeSession(client, sessionId)
          resumed = true
          return attemptAttachment()
        }
        if (!isSessionWorkerStartingError(error) || Date.now() >= deadline) {
          throw error
        }
        await delay(ATTACHMENT_STARTUP_RETRY_MS)
        return attemptAttachment()
      }
    }
    return attemptAttachment()
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
    if (!activeSessionId) {
      throw new Error("Prime Agent attachment requires an active session identity")
    }
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
      this.requireActiveRuntime()
      const nativeState = readRecord(
        readRecord(initialSnapshot, "connection snapshot").state,
        "connection state",
      )
      const snapshot = projectPrimeSessionSnapshot(
        enrichPrimeSessionSnapshot({
          previous: previousSnapshot,
          snapshot: initialSnapshot,
        }),
        previousSnapshot?.session ?? previousSession,
      )
      if (snapshot.session.id !== sessionId) {
        throw new Error("Prime Agent attached a different session than Ernie requested")
      }
      // Recovery must not depend on the first periodic catalog refresh winning this race.
      this.sessionTargets.set(sessionId, {
        activeSessionId:
          readString(nativeState.activeSessionId) ??
          this.sessionTargets.get(sessionId)?.activeSessionId,
        sessionFile:
          readString(nativeState.sessionFile) ?? this.sessionTargets.get(sessionId)?.sessionFile,
      })
      attachment = {
        connection,
        disposed: false,
        generation: crypto.randomUUID(),
        needsRefresh: eventBeforeReady,
        refreshFailureCount: 0,
        refreshQueued: false,
        refreshTail: Promise.resolve(),
        refreshTimer: undefined,
        revision: 0,
        sessionId,
        snapshot,
        unsubscribe,
      }
      this.summaries.set(sessionId, snapshot.session)
      this.upsertCatalogSession(snapshot.session)
      return attachment
    } catch (error) {
      unsubscribe()
      await Promise.allSettled([connection.dispose()])
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

  private handleConnectionEvent(attachment: SessionAttachment, event: AgentConnectionEvent) {
    if (this.attachments.get(attachment.sessionId) !== attachment) {
      attachment.needsRefresh = true
      return
    }
    if (event.type === "closed") {
      if (!this.recoveryPromise) {
        this.beginRecovery()
      }
      return
    }
    if (event.type === "connection_status" && event.status === "reconnecting") {
      this.updateProjectedSnapshot(attachment, {
        ...attachment.snapshot,
        transport: { error: "Prime Agent is reconnecting", status: "reconnecting" },
      })
      return
    }
    if (event.type === "session_resynced") {
      this.replaceAttachmentSnapshot(attachment, event.snapshot)
      return
    }
    const coalesce =
      event.type === "session_event" &&
      (event.event.type === "message_update" || event.event.type === "bash_output")
    this.scheduleRefresh(attachment, !coalesce)
  }

  private replaceAttachmentSnapshot(attachment: SessionAttachment, input: unknown) {
    try {
      const snapshot = projectPrimeSessionSnapshot(
        enrichPrimeSessionSnapshot({ previous: attachment.snapshot, snapshot: input }),
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
    if (attachment.disposed) {
      return
    }
    if (this.attachments.get(attachment.sessionId) !== attachment) {
      attachment.needsRefresh = true
      return
    }
    if (!immediate && attachment.refreshTimer) {
      return
    }
    if (immediate && attachment.refreshTimer) {
      clearTimeout(attachment.refreshTimer)
      attachment.refreshTimer = undefined
    }

    const refresh = () => {
      attachment.refreshTimer = undefined
      // One queued read observes the newest native state for the entire burst.
      // Clear on entry so events during that read can request one follow-up.
      if (attachment.refreshQueued) {
        return
      }
      attachment.refreshQueued = true
      const previousRefresh = attachment.refreshTail
      const runRefresh = async () => {
        try {
          await previousRefresh
          attachment.refreshQueued = false
          await this.refreshAttachment(attachment)
          attachment.refreshFailureCount = 0
        } catch {
          attachment.refreshFailureCount += 1
          if (attachment.refreshFailureCount <= MAX_REFRESH_FAILURES) {
            this.scheduleRefresh(attachment, false)
          } else {
            attachment.refreshFailureCount = 0
            this.beginRecovery()
          }
        }
      }
      attachment.refreshTail = runRefresh()
    }
    if (immediate) {
      refresh()
    } else {
      attachment.refreshTimer = setTimeout(refresh, STREAM_REFRESH_INTERVAL_MS)
    }
  }

  private async refreshAttachment(attachment: SessionAttachment) {
    const { connection } = attachment
    if (
      attachment.disposed ||
      this.attachments.get(attachment.sessionId) !== attachment ||
      !connection
    ) {
      return
    }

    const { generation } = attachment
    const snapshot = await projectCurrentPrimeSessionRefresh({
      isCurrent: () =>
        !attachment.disposed &&
        this.attachments.get(attachment.sessionId) === attachment &&
        attachment.connection === connection &&
        attachment.generation === generation,
      previousSession: attachment.snapshot.session,
      readSnapshot: async () =>
        enrichPrimeSessionSnapshot({
          previous: attachment.snapshot,
          snapshot: await connection.getInitialSnapshot(),
        }),
    })
    if (!snapshot) {
      return
    }
    this.updateProjectedSnapshot(attachment, snapshot)
  }

  private updateProjectedSnapshot(attachment: SessionAttachment, snapshot: PrimeSessionSnapshot) {
    const changes = diffPrimeSessionSnapshots(attachment.snapshot, snapshot)
    if (changes.length === 0) {
      return
    }

    attachment.snapshot = snapshot
    this.summaries.set(attachment.sessionId, snapshot.session)
    this.upsertCatalogSession(snapshot.session)
    for (const change of changes) {
      attachment.revision += 1
      const envelope: PrimeSessionChangeEnvelope = {
        change,
        generation: attachment.generation,
        revision: attachment.revision,
        sessionId: attachment.sessionId,
      }
      const parsed = parsePrimeSessionChangeEnvelope(envelope)
      if (!parsed.ok) {
        throw parsed.error
      }
      this.ctx.rpc.emit.app.primeSessionChanged(parsed.value)
    }
  }

  private emitSnapshot(attachment: SessionAttachment) {
    const parsed = parsePrimeSessionSnapshotEnvelope(snapshotEnvelope(attachment))
    if (!parsed.ok) {
      throw parsed.error
    }
    this.ctx.rpc.emit.app.primeSessionSnapshot(parsed.value)
  }

  private async refreshSessionCatalog() {
    if (this.catalogRefresh) {
      return this.catalogRefresh
    }
    const refresh = this.readSessionCatalog()
    this.catalogRefresh = refresh
    try {
      return await refresh
    } finally {
      if (this.catalogRefresh === refresh) {
        this.catalogRefresh = undefined
      }
    }
  }

  private async refreshConnectedCatalog() {
    try {
      await this.refreshSessionCatalog()
    } catch {
      if (this.disposed || this.recoveryPromise) {
        return
      }
      this.detachClient()
      this.failAllAttachments()
      this.setConnection({
        error: "Prime Agent did not return its session catalog. Check your daemon, then retry.",
        status: "unavailable",
      })
    }
  }

  private async readSessionCatalog() {
    const data = await this.request({ all: true, type: "list" }, 5000)
    if (this.disposed) {
      return
    }
    const catalog = readSessionList(data).map(toCatalogSession)
    const listedSessions = catalog.map(({ summary }) => summary)
    const sessions = listedSessions.map((session) => {
      const attached = this.attachments.get(session.id)?.snapshot.session
      return attached
        ? {
            ...attached,
            activityAt: session.activityAt,
            activitySummary: session.activitySummary,
            cwd: session.cwd,
            name: session.name,
            rlmDepth: session.rlmDepth,
            workerFailed: session.workerFailed,
            ...(session.state === "recovering" ? { state: session.state } : {}),
          }
        : session
    })
    this.sessionTargets.clear()
    for (const { summary, target } of catalog) {
      this.sessionTargets.set(summary.id, target)
    }
    this.summaries.clear()
    for (const session of sessions) {
      this.summaries.set(session.id, session)
    }
    this.replaceCatalogSessions(sessions)
  }

  private async resumeSession(client: DaemonClient, sessionId: string) {
    let sessionFile = this.sessionTargets.get(sessionId)?.sessionFile
    if (!sessionFile) {
      // Use this client directly: getClient waits for the recovery that called us.
      const listed = requireSuccess(await client.request({ all: true, type: "list" }))
      const saved = readSessionList(listed)
        .map(toCatalogSession)
        .find((item) => item.summary.id === sessionId)
      if (saved) {
        this.sessionTargets.set(sessionId, saved.target)
      }
      sessionFile = saved?.target.sessionFile
    }
    if (!sessionFile) {
      throw new Error(`Prime Agent session ${sessionId} cannot be resumed`)
    }

    const roster = await Effect.runPromise(this.ctx.agentStore.read())
    const origin = roster.associations.find((item) => item.sessionId === sessionId)?.origin
    const resumed = requireSuccess(
      await client.request(
        {
          sessionPath: sessionFile,
          type: "create",
          ...(origin ? { config: nativeConversationConfig(origin, true) } : {}),
        },
        CREATE_SESSION_TIMEOUT_MS,
      ),
    )
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
    if (sameSessionSummary(this.catalogSessions[index], session)) {
      return
    }
    this.replaceCatalogSessions(
      this.catalogSessions.map((existing) => (existing.id === session.id ? session : existing)),
    )
  }

  private replaceCatalogSessions(sessions: readonly PrimeSessionSummary[]) {
    const selectedSessionId =
      this.selectedSessionId && sessions.some(({ id }) => id === this.selectedSessionId)
        ? this.selectedSessionId
        : undefined
    if (
      sameSessionCatalog(this.catalogSessions, sessions) &&
      selectedSessionId === this.selectedSessionId
    ) {
      return
    }
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
      connection: this.connection,
      revision: this.stateRevision,
      ...(this.selectedSessionId ? { selectedSessionId: this.selectedSessionId } : {}),
      sessions: this.catalogSessions,
    }
  }

  private failAttachment(attachment: SessionAttachment, duringRecovery = false) {
    if (attachment.disposed || (this.recoveryPromise && !duringRecovery)) {
      return
    }
    this.updateProjectedSnapshot(attachment, {
      ...attachment.snapshot,
      session: { ...attachment.snapshot.session, state: "recovering" },
      transport: { error: "Prime Agent connection failed", status: "failed" },
    })
  }

  private setConnection(state: PrimeDaemonConnection["state"]) {
    if (this.disposed) {
      return
    }
    this.connection = { socketPath: this.endpoint.socketPath, state }
    this.publishSessionState()
  }

  private beginRecovery() {
    if (this.disposed) {
      return
    }
    this.recoveryRequested = true
    if (this.recoveryPromise) {
      return
    }
    this.launchAttempted = false
    const recovery = this.recoverUntilReady()
    const trackRecovery = async () => {
      let recovered = false
      try {
        recovered = await recovery
      } finally {
        this.recoveryPromise = undefined
        this.recoveryRequested = false
      }
      if (!this.disposed && recovered && this.client?.isConnected) {
        // Publish readiness only after commands can pass the recovery barrier.
        this.setConnection({
          status: "connected",
          version: this.client.hello?.appVersion ?? "unknown",
        })
        await this.refreshConnectedCatalog()
      }
    }
    const tracked = trackRecovery()
    this.recoveryPromise = tracked
  }

  private async recoverUntilReady() {
    let attempt = 0
    let ready = false
    await runPrimeAgentRecoveryLoop({
      attempt: async () => {
        attempt += 1
        this.recoveryRequested = false
        this.setConnection({ attempt, status: "connecting" })
        let recovered: boolean
        try {
          recovered = await this.recoverAttachments()
        } catch {
          this.failAllAttachments()
          recovered = false
        }
        ready = recovered && !this.recoveryRequested && this.client?.isConnected === true
        if (ready) {
          this.recoveryRetry.clear()
        }
        return ready
      },
      shouldStop: () => this.disposed || (attempt > 0 && this.connectionFailedPermanently()),
      wait: () => this.recoveryRetry.wait(),
    })
    if (!this.disposed && !ready && !this.connectionFailedPermanently()) {
      this.detachClient()
      this.setConnection({
        error:
          "Prime Agent is unavailable after 3 attempts. Start or check your existing daemon, then retry.",
        status: "unavailable",
      })
    }
    return ready
  }

  private async recoverAttachments() {
    const previous = [...this.attachments.values()]
    for (const attachment of previous) {
      this.updateProjectedSnapshot(attachment, {
        ...attachment.snapshot,
        session: { ...attachment.snapshot.session, state: "recovering" },
        transport: { error: "Prime Agent is reconnecting", status: "reconnecting" },
      })
    }

    await Promise.allSettled(
      previous.map((attachment) => PrimeAgentService.releaseAttachment(attachment)),
    )
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
    const replaceAttachment = async (index: number): Promise<boolean> => {
      const oldAttachment = previous[index]
      if (!oldAttachment) {
        return true
      }
      try {
        const attachment = await this.createAttachment(
          client,
          oldAttachment.sessionId,
          oldAttachment.snapshot,
        )
        if (this.disposed) {
          await PrimeAgentService.releaseAttachment(attachment)
          await Promise.allSettled(
            replacements.map((replacement) => PrimeAgentService.releaseAttachment(replacement)),
          )
          return false
        }
        replacements.push(attachment)
      } catch {
        await Promise.allSettled(
          replacements.map((replacement) => PrimeAgentService.releaseAttachment(replacement)),
        )
        this.installFailedAttachments(previous)
        return false
      }
      return replaceAttachment(index + 1)
    }
    if (!(await replaceAttachment(0))) {
      return false
    }

    for (const attachment of replacements) {
      this.installAttachment(attachment)
      this.emitSnapshot(attachment)
    }
    return true
  }

  private installFailedAttachments(previous: readonly SessionAttachment[]) {
    if (this.disposed) {
      return
    }
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

  private static async releaseAttachment(attachment: SessionAttachment) {
    if (attachment.disposed) {
      return
    }
    attachment.disposed = true
    if (attachment.refreshTimer) {
      clearTimeout(attachment.refreshTimer)
    }
    attachment.refreshTimer = undefined
    attachment.unsubscribe()
    await Promise.allSettled([attachment.refreshTail])
    await Promise.allSettled([attachment.connection?.dispose()])
    attachment.connection = undefined
  }

  private async request(command: CommandBody, timeoutMs = 30_000) {
    const client = await this.getClient()
    return requireSuccess(await client.request(command, timeoutMs))
  }

  private async getClient() {
    this.requireActiveRuntime()
    if (this.recoveryPromise) {
      await this.recoveryPromise
    }
    this.requireActiveRuntime()
    if (this.client?.isConnected) {
      return this.client
    }
    throw new PrimeDaemonUnavailableError()
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

  private connectionFailedPermanently() {
    return (
      this.connection.state.status === "incompatible" ||
      this.connection.state.status === "not-installed" ||
      this.connection.state.status === "failed"
    )
  }

  private async openClient() {
    this.requireActiveRuntime()
    try {
      return await connectPrimeDaemon(this.endpoint.socketPath, this.endpoint.ownership)
    } catch (error) {
      this.requireActiveRuntime()
      if (error instanceof IncompatiblePrimeDaemonError) {
        this.setConnection({ error: error.message, status: "incompatible" })
        throw error
      }
      if (
        !this.endpoint.autoStart ||
        this.launchAttempted ||
        !(await isPrimeDaemonAbsent(this.endpoint.socketPath))
      ) {
        throw new Error("Prime Agent is unavailable. Check your daemon, then retry.", {
          cause: error,
        })
      }
      this.requireActiveRuntime()
      this.launchAttempted = true
      const launch = await this.installedDaemon.start(this.endpoint.socketPath, () => this.disposed)
      this.requireActiveRuntime()
      if (launch.status !== "started") {
        this.setConnection(launch)
        throw new Error(launch.error, { cause: error })
      }
      this.setConnection({ status: "starting" })
      return this.waitForStartedDaemon(Date.now() + 30_000)
    }
  }

  private async waitForStartedDaemon(
    deadline: number,
    exitDeadline?: number,
  ): Promise<DaemonClient> {
    this.requireActiveRuntime()
    try {
      return await connectPrimeDaemon(this.endpoint.socketPath, this.endpoint.ownership)
    } catch (error) {
      this.requireActiveRuntime()
      if (error instanceof IncompatiblePrimeDaemonError) {
        this.setConnection({ error: error.message, status: "incompatible" })
        throw error
      }
      // A competing launcher may have won the upstream lock. Give its greeting time to arrive.
      const exitedAt = exitDeadline ?? (this.installedDaemon.exited ? Date.now() + 2000 : undefined)
      if (Date.now() >= Math.min(deadline, exitedAt ?? deadline)) {
        const failure = {
          error:
            "Prime Agent did not become ready within the startup limit. Check its daemon logs and executable, then retry. Ernie left the process untouched.",
          status: "failed" as const,
        }
        this.setConnection(failure)
        throw new Error(failure.error, { cause: error })
      }
      await this.recoveryRetry.wait()
      return this.waitForStartedDaemon(deadline, exitedAt)
    }
  }

  private async disposeRuntime() {
    if (this.disposed) {
      return
    }
    this.disposed = true
    const recovery = this.recoveryPromise
    this.recoveryRetry.clear()
    const attachments = [...this.attachments.values()]
    const pendingAttachments = [...this.attachmentPromises.values()]
    this.attachments.clear()
    // Reject in-flight native requests before joining their cleanup. Socket closure
    // releases native attachments without terminating the externally owned daemon.
    this.detachClient()
    await Promise.allSettled(
      attachments.map((attachment) => PrimeAgentService.releaseAttachment(attachment)),
    )
    await Promise.allSettled(pendingAttachments)
    await Promise.allSettled([recovery])
    this.detachClient()
  }

  private requireActiveRuntime() {
    if (this.disposed) {
      throw new Error("Prime Agent service is shutting down")
    }
  }
}
