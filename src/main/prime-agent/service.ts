import { spawn } from "node:child_process"
import { mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import { fileURLToPath } from "node:url"
import { Service } from "@zenbujs/core/runtime"
import { RpcService } from "@zenbujs/core/services"
import { Option, Schema } from "effect"
import {
  DaemonAgentConnection,
  DaemonClient,
  type AgentConnectionEvent,
  type DaemonCommand,
  type DaemonResponse,
} from "prime-agent"

import type {
  PrimeModel,
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
import { checkPrimeAgentCommandAvailability } from "./command-availability"
import { projectCurrentPrimeSessionRefresh } from "./refresh"
import { enrichPrimeSessionSnapshot } from "./snapshot"
import { chooseAvailableSessionName } from "./session-name"

type CommandBody = DaemonCommand extends infer Command
  ? Command extends { id?: string }
    ? Omit<Command, "id">
    : never
  : never

type PrimeAgentConfig = Readonly<{
  socketPath: string
  agentDir?: string
  executablePath: string
  startDaemonIfMissing: boolean
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

const STREAM_REFRESH_INTERVAL_MS = 50
const MAX_REFRESH_FAILURES = 2
const CREATE_SESSION_TIMEOUT_MS = 60_000
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

/** Owns Ernie's shared Prime Agent daemon client and logical session attachments. */
export class PrimeAgentService extends Service.create({
  key: "primeAgent",
  deps: { rpc: RpcService },
}) {
  private readonly config = readPrimeAgentConfig()
  private readonly attachments = new Map<string, SessionAttachment>()
  private readonly attachmentPromises = new Map<string, Promise<SessionAttachment>>()
  private readonly summaries = new Map<string, PrimeSessionSummary>()
  private client: DaemonClient | undefined
  private connecting: Promise<DaemonClient> | undefined
  private unsubscribeClientClose: (() => void) | undefined
  private recoveryPromise: Promise<void> | undefined
  private disposed = false

  /** Registers one cleanup owner for every Prime Agent resource. */
  evaluate() {
    this.setup("prime-agent-runtime", () => () => this.disposeRuntime())
  }

  /** Lists sessions currently visible through the shared daemon. */
  async listSessions() {
    const data = await this.request({ type: "list" })
    const sessions = readSessionList(data).map(toSessionSummary)
    for (const session of sessions) this.summaries.set(session.id, session)
    return sessions
  }

  /** Creates one resident Prime Agent session without attaching a renderer. */
  async createSession(input: { cwd: string; name?: string }) {
    const name = chooseAvailableSessionName(input.name, await this.listSessions())
    const data = await this.request(
      {
        type: "create",
        name,
        config: { cwd: input.cwd },
        lifecycle: "resident",
      },
      CREATE_SESSION_TIMEOUT_MS,
    )
    const session = toSessionSummary(readRecord(data, "create response"))
    this.summaries.set(session.id, session)
    return session
  }

  /** Attaches one logical connection and returns its current projected snapshot. */
  async attachSession(input: { sessionId: string }): Promise<PrimeSessionSnapshotEnvelope> {
    if (this.recoveryPromise) await this.recoveryPromise
    return snapshotEnvelope(await this.getAttachment(input.sessionId))
  }

  /** Submits one prompt through its owning logical attachment. */
  async prompt(input: {
    sessionId: string
    admissionId: string
    commandId: string
    content: string
  }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.prompt(input.content, { source: "interactive" })
    return { admissionId: input.admissionId, commandId: input.commandId }
  }

  /** Queues one follow-up through its owning logical attachment. */
  async followUp(input: { sessionId: string; content: string }) {
    const connection = await this.getReadyConnection(input.sessionId)
    await connection.followUp(input.content)
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

  private async getReadyConnection(sessionId: string) {
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
    return availability.connection
  }

  private async getAttachment(sessionId: string) {
    const existing = this.attachments.get(sessionId)
    if (existing?.connection) return existing
    if (existing) {
      await this.releaseAttachment(existing)
      this.attachments.delete(sessionId)
    }

    const pending = this.attachmentPromises.get(sessionId)
    if (pending) return pending
    const creation = this.createAttachment(
      await this.getClient(),
      sessionId,
      existing?.snapshot.session ?? this.summaries.get(sessionId),
    )
    this.attachmentPromises.set(sessionId, creation)
    try {
      const attachment = await creation
      this.installAttachment(attachment)
      return attachment
    } finally {
      this.attachmentPromises.delete(sessionId)
    }
  }

  private async createAttachment(
    client: DaemonClient,
    sessionId: string,
    previousSession?: PrimeSessionSummary,
  ) {
    let attachment: SessionAttachment | undefined
    let eventBeforeReady = false
    const connection = new DaemonAgentConnection(client, sessionId, {
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
      const snapshot = projectPrimeSessionSnapshot(
        enrichPrimeSessionSnapshot({ snapshot: await connection.getInitialSnapshot() }),
        previousSession,
      )
      if (snapshot.session.id !== sessionId) {
        throw new Error("Prime Agent attached a different session than Ernie requested")
      }
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

  private failAttachment(attachment: SessionAttachment, duringRecovery = false) {
    if (attachment.disposed || (this.recoveryPromise && !duringRecovery)) return
    this.updateProjectedSnapshot(attachment, {
      ...attachment.snapshot,
      session: { ...attachment.snapshot.session, state: "recovering" },
      transport: { status: "failed", error: "Prime Agent connection failed" },
    })
  }

  private beginRecovery() {
    if (this.disposed || this.recoveryPromise) return
    const recovery = this.recoverAttachments().catch(() => this.failAllAttachments())
    const tracked = recovery.then(() => {
      if (this.recoveryPromise === tracked) this.recoveryPromise = undefined
    })
    this.recoveryPromise = tracked
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
      if (!this.disposed) {
        for (const oldAttachment of previous) {
          const failed = failedAttachment(oldAttachment)
          this.installAttachment(failed)
          this.emitSnapshot(failed)
        }
      }
      return
    }
    if (this.disposed) {
      client.close()
      return
    }

    for (const oldAttachment of previous) {
      try {
        const attachment = await this.createAttachment(
          client,
          oldAttachment.sessionId,
          oldAttachment.snapshot.session,
        )
        this.installAttachment(attachment)
        this.emitSnapshot(attachment)
      } catch {
        const failed = failedAttachment(oldAttachment)
        this.installAttachment(failed)
        this.emitSnapshot(failed)
      }
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
      return await connectClient(this.config.socketPath)
    } catch (cause) {
      if (!this.config.startDaemonIfMissing) {
        throw new Error("The configured Prime Agent socket is unavailable", { cause })
      }
      startDaemon(this.config)
      const deadline = Date.now() + 10_000
      let lastError: unknown
      while (Date.now() < deadline) {
        try {
          return await connectClient(this.config.socketPath)
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
    const attachments = [...this.attachments.values()]
    this.attachments.clear()
    this.attachmentPromises.clear()
    await Promise.allSettled(attachments.map((attachment) => this.releaseAttachment(attachment)))
    this.detachClient()
    await recovery?.catch(() => undefined)
  }
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

function startDaemon(config: PrimeAgentConfig) {
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

function readPrimeAgentConfig(): PrimeAgentConfig {
  const socketOverride = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_SOCKET,
    "ERNIE_PRIME_AGENT_SOCKET",
  )
  const agentDir = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_AGENT_DIR,
    "ERNIE_PRIME_AGENT_AGENT_DIR",
  )
  const executablePath = readAbsolutePath(
    process.env.ERNIE_PRIME_AGENT_EXECUTABLE,
    "ERNIE_PRIME_AGENT_EXECUTABLE",
  ) ?? process.execPath
  return {
    socketPath: socketOverride ?? join(
      homedir(),
      "Library",
      "Application Support",
      "Ernie",
      "prime-agent-v0.8.1.sock",
    ),
    agentDir,
    executablePath,
    startDaemonIfMissing: socketOverride === undefined || process.env.ERNIE_PRIME_AGENT_START_DAEMON === "1",
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

function toSessionSummary(value: Record<string, unknown>): PrimeSessionSummary {
  const id = readString(value.activeSessionId) ?? readString(value.id)
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
    id,
    cwd,
    name: readString(value.sessionName),
    lifecycle,
    state: value.workerState === "recovering" ? "recovering" : busy ? "working" : "idle",
    model: readModel(value.model),
  }
}

function readLifecycle(value: unknown): PrimeSessionSummary["lifecycle"] {
  if (value === "archived" || value === "draft" || value === "live") return value
  throw new Error("Prime Agent returned an invalid session lifecycle")
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
