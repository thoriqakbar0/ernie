import { createServer } from "node:net"
import { readDevConfig } from "../../scripts/dev/config"
import { existingDaemonSocketPath, connectPrimeDaemon } from "../main/prime-agent/daemon-client"
import { connectRpc } from "@zenbujs/core/rpc"
import { RuntimeDescriptor } from "../dev/runtime-descriptor"
import type { PrimeAgentService } from "../main/prime-agent/service"
import type { AgentsService } from "../main/services/agents"
import { Roster } from "../packages/agents"
import type { AgentResult } from "../packages/agents"
import { Effect, Schema } from "effect"
import { SendReceipt } from "../packages/prime-agent"
import { SessionManager, DaemonAgentConnection, DaemonClient } from "prime-agent"
import type { AgentConnectionEvent, DaemonResponse } from "prime-agent"
import { nativeConversationConfig } from "../main/prime-agent/agent-config"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { mkdtemp, readFile, rm, stat, mkdir, rename, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import test from "node:test"

const createdSessionSchema = Schema.Struct({
  activeSessionId: Schema.NonEmptyString,
})

const startDaemon = (socketPath: string, agentDir: string) => {
  const packageEntry = import.meta.resolve("prime-agent")
  const cliPath = fileURLToPath(new URL("bundle/cli.js", packageEntry))
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("PRIME_AGENT_INTERNAL_")),
  )
  return spawn(process.execPath, [cliPath, "--mode", "daemon", "--daemon-socket", socketPath], {
    env: {
      ...environment,
      ELECTRON_RUN_AS_NODE: "1",
      PRIME_AGENT_CODING_AGENT_DIR: agentDir,
    },
    stdio: "ignore",
  })
}

const connectDaemon = (socketPath: string) => {
  const deadline = Date.now() + 10_000
  let lastError: unknown

  const attempt = async (): Promise<DaemonClient> => {
    if (Date.now() >= deadline) {
      throw new Error("The isolated Prime Agent daemon did not become ready", { cause: lastError })
    }
    const client = new DaemonClient(socketPath)
    try {
      await client.connect(500)
      await client.waitForHello(1000)
      client.enableRequestRecovery()
      return client
    } catch (error) {
      lastError = error
      client.close()
      await delay(100)
      return attempt()
    }
  }
  return attempt()
}

const requireSuccess = (response: DaemonResponse) => {
  if (!response.success) {
    throw new Error(response.error)
  }
  return response.data
}

const createSession = async (client: DaemonClient, cwd: string, name: string) => {
  const response = await client.request({
    config: { cwd },
    lifecycle: "resident",
    name,
    noSession: true,
    type: "create",
  })
  const data = requireSuccess(response)
  return Schema.decodeUnknownSync(createdSessionSchema)(data).activeSessionId
}

const waitForEvent = async (
  connection: DaemonAgentConnection,
  predicate: (event: AgentConnectionEvent) => boolean,
) => {
  const pending = Promise.withResolvers<AgentConnectionEvent>()
  const unsubscribe = connection.subscribe((event) => {
    if (predicate(event)) {
      pending.resolve(event)
    }
  })
  const timeout = setTimeout(() => {
    pending.reject(new Error("Timed out waiting for a Prime Agent session event"))
  }, 5000)
  try {
    return await pending.promise
  } finally {
    clearTimeout(timeout)
    unsubscribe()
  }
}

const waitForOutput = async (child: ChildProcess, expected: string, timeoutMs: number) => {
  const { stdout, stderr } = child
  if (!stdout || !stderr) {
    throw new Error("Ernie development output is unavailable")
  }
  const pending = Promise.withResolvers<null>()
  let output = ""
  const onData = (chunk: Buffer | string) => {
    output += chunk.toString()
    if (output.includes(expected)) {
      pending.resolve(null)
    }
  }
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    pending.reject(
      new Error(
        `Ernie development exited before readiness (${code ?? signal ?? "unknown"}): ${output.slice(-3000)}`,
      ),
    )
  }
  const timeout = setTimeout(() => {
    pending.reject(new Error(`Timed out waiting for ${expected}: ${output.slice(-3000)}`))
  }, timeoutMs)
  stdout.on("data", onData)
  stderr.on("data", onData)
  child.once("exit", onExit)
  try {
    await pending.promise
  } finally {
    clearTimeout(timeout)
    stdout.off("data", onData)
    stderr.off("data", onData)
    child.off("exit", onExit)
  }
}

const waitForExit = async (child: ChildProcess, timeoutMs: number) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return true
  }
  const pending = Promise.withResolvers<boolean>()
  const onExit = () => pending.resolve(true)
  const timeout = setTimeout(() => pending.resolve(false), timeoutMs)
  child.once("exit", onExit)
  try {
    return await pending.promise
  } finally {
    clearTimeout(timeout)
    child.off("exit", onExit)
  }
}

const stopDaemon = async (client: DaemonClient, daemon: ChildProcess) => {
  await client.request({ force: true, type: "shutdown" }, 5000).catch(() => {})
  client.close()
  if (daemon.exitCode !== null) {
    return
  }

  const exited = await waitForExit(daemon, 3000)
  if (exited) {
    return
  }

  daemon.kill("SIGTERM")
  await waitForExit(daemon, 2000)
}

const unwrapAgentResult = <A>(result: AgentResult<A>): A => {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.value
}

const connectRosterRpc = async (runtimeFile: string) => {
  const descriptor = Schema.decodeUnknownSync(RuntimeDescriptor)(
    JSON.parse(await readFile(runtimeFile, "utf-8")),
  )
  const url = new URL(descriptor.origin)
  url.protocol = "ws:"
  url.searchParams.set("token", descriptor.authToken)
  const socket = new WebSocket(url)
  const opened = Promise.withResolvers<null>()
  socket.addEventListener("open", () => opened.resolve(null), { once: true })
  socket.addEventListener(
    "error",
    () => opened.reject(new Error("Fixture RPC connection failed")),
    {
      once: true,
    },
  )
  await opened.promise
  const frame = Schema.Struct({ ch: Schema.String, data: Schema.String })
  const rpc = await connectRpc<{
    app: {
      agents: Pick<
        AgentsService,
        | "getRoster"
        | "save"
        | "assign"
        | "createConversation"
        | "reconcileRoster"
        | "select"
        | "bindRoot"
      >
      primeAgent: Pick<
        PrimeAgentService,
        "connectDaemon" | "attachSession" | "getSendEpoch" | "sendMessage" | "checkSend"
      >
    }
  }>({
    send: (data) => socket.send(JSON.stringify({ ch: "rpc", data })),
    subscribe: (onMessage) => {
      const handler = (event: MessageEvent) => {
        if (typeof event.data !== "string") {
          return
        }
        const parsed = Schema.decodeUnknownOption(frame)(JSON.parse(event.data))
        if (parsed._tag === "Some" && parsed.value.ch === "rpc") {
          return onMessage(parsed.value.data)
        }
      }
      socket.addEventListener("message", handler)
      return () => socket.removeEventListener("message", handler)
    },
    version: "0",
  })
  return {
    agents: rpc.server.app.agents,
    close: () => {
      rpc.disconnect()
      socket.close()
    },
    prime: rpc.server.app.primeAgent,
  }
}

// @lat: [[tests#Behavior specifications#Daemon boundary#Logical attachment isolation]]
test(
  "one daemon client isolates two logical session attachments",
  { timeout: 30_000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "ernie-prime-agent-"))
    const socketPath = path.join(root, "daemon.sock")
    const agentDir = path.join(root, "agent")
    let legacyConnections = 0
    const legacySocket = path.join(root, "prime-agent.sock")
    const legacy = createServer((socket) => {
      legacyConnections += 1
      socket.end()
    })
    const listening = once(legacy, "listening")
    legacy.listen(legacySocket)
    await listening
    t.after(() => promisify(legacy.close.bind(legacy))())
    assert.notEqual(socketPath, legacySocket)
    for (const role of ["all", "server", "web"]) {
      assert.equal(readDevConfig([role], {}, root).daemonSocketPath, existingDaemonSocketPath())
    }
    const external = readDevConfig(["server"], { ERNIE_PRIME_AGENT_SOCKET: legacySocket }, root)
    assert.equal(external.daemonSocketPath, legacySocket)
    assert.equal(external.daemonLifecycle, "external")
    const daemon = startDaemon(socketPath, agentDir)
    const client = await connectDaemon(socketPath)
    const checked = await connectPrimeDaemon(socketPath, "managed")
    checked.close()
    assert.equal(legacyConnections, 0, "startup must not connect to the previous version's socket")
    assert.equal(legacy.listening, true)
    const connections: DaemonAgentConnection[] = []

    t.after(async () => {
      await Promise.allSettled(connections.map((connection) => connection.dispose()))
      await stopDaemon(client, daemon)
      await rm(root, { force: true, recursive: true })
    })

    const firstSessionId = await createSession(client, root, "first")
    const secondSessionId = await createSession(client, root, "second")
    assert.notEqual(firstSessionId, secondSessionId)

    const [first, second] = await Promise.all([
      DaemonAgentConnection.attach(client, firstSessionId, { closeClientOnDispose: false }),
      DaemonAgentConnection.attach(client, secondSessionId, { closeClientOnDispose: false }),
    ])
    connections.push(first, second)

    const [firstSnapshot, secondSnapshot] = await Promise.all([
      first.getInitialSnapshot(),
      second.getInitialSnapshot(),
    ])
    assert.equal(firstSnapshot.state.activeSessionId, firstSessionId)
    assert.equal(secondSnapshot.state.activeSessionId, secondSessionId)
    assert.equal(client.isConnected, true)
    assert.equal(client.hello?.protocol.version, 7)

    const firstEvents: AgentConnectionEvent[] = []
    const secondEvents: AgentConnectionEvent[] = []
    const unsubscribeFirst = first.subscribe((event) => {
      firstEvents.push(event)
    })
    const unsubscribeSecond = second.subscribe((event) => {
      secondEvents.push(event)
    })
    t.after(unsubscribeFirst)
    t.after(unsubscribeSecond)

    const firstRename = waitForEvent(
      first,
      (event) => event.type === "session_event" && event.event.type === "session_info_changed",
    )
    const secondRename = waitForEvent(
      second,
      (event) => event.type === "session_event" && event.event.type === "session_info_changed",
    )
    await Promise.all([
      first.setSessionName("renamed first session"),
      second.setSessionName("renamed second session"),
    ])
    const [firstRenameEvent, secondRenameEvent] = await Promise.all([firstRename, secondRename])

    assert.equal(firstRenameEvent.type, "session_event")
    assert.equal(firstRenameEvent.event.type, "session_info_changed")
    assert.equal(firstRenameEvent.event.name, "renamed first session")
    assert.equal(secondRenameEvent.type, "session_event")
    assert.equal(secondRenameEvent.event.type, "session_info_changed")
    assert.equal(secondRenameEvent.event.name, "renamed second session")
    assert.equal(
      firstEvents.some(
        (event) =>
          event.type === "session_event" &&
          event.event.type === "session_info_changed" &&
          event.event.name === "renamed second session",
      ),
      false,
    )
    assert.equal(
      secondEvents.some(
        (event) =>
          event.type === "session_event" &&
          event.event.type === "session_info_changed" &&
          event.event.name === "renamed first session",
      ),
      false,
    )
  },
)

// @lat: [[tests#Behavior specifications#Daemon boundary#External daemon ownership]]
test(
  "Ernie cleanup leaves an external Prime Agent daemon running",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "ernie-external-prime-agent-"))
    const socketPath = path.join(root, "daemon.sock")
    const agentDir = path.join(root, "agent")
    const daemon = startDaemon(socketPath, agentDir)
    const daemonClient = await connectDaemon(socketPath)
    const projectRoot = path.resolve(import.meta.dirname, "../..")
    const development = spawn(process.execPath, ["scripts/dev.ts", "server"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ERNIE_DEV_OPEN_BROWSER: "0",
        ERNIE_DEV_PROFILE: `external-daemon-${process.pid}`,
        ERNIE_DEV_STATE_ROOT: path.join(root, "ernie"),
        ERNIE_PRIME_AGENT_SOCKET: socketPath,
        ERNIE_PRIME_AGENT_START_DAEMON: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    t.after(async () => {
      if (development.exitCode === null) {
        development.kill("SIGTERM")
        await waitForExit(development, 10_000)
      }
      await stopDaemon(daemonClient, daemon)
      await rm(root, { force: true, recursive: true })
    })

    await waitForOutput(development, "Runtime:", 45_000)
    development.kill("SIGTERM")
    assert.equal(await waitForExit(development, 10_000), true)

    assert.equal(daemon.exitCode, null)
    const socketStats = await stat(socketPath)
    assert.equal(socketStats.isSocket(), true)
    const survivingClient = await connectDaemon(socketPath)
    try {
      requireSuccess(await survivingClient.request({ type: "list" }))
    } finally {
      survivingClient.close()
    }
  },
)

// Opt-in daemon integration: no model request or provider credentials are required.
test(
  "Agent instructions survive native resume after daemon restart",
  { timeout: 60_000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "ernie-agent-origin-"))
    const socketPath = path.join(root, "daemon.sock")
    const agentDir = path.join(root, "agent")
    let daemon = startDaemon(socketPath, agentDir)
    let client = await connectDaemon(socketPath)
    t.after(async () => {
      await stopDaemon(client, daemon)
      await rm(root, { force: true, recursive: true })
    })
    const origin = {
      agentId: "fixture-agent",
      cwd: root,
      instructionRevision: 1,
      instructions: "Use the original fixture role: cedar-731.",
      model: "",
      provider: "",
    }
    const createdSchema = Schema.Struct({ activeSessionId: Schema.NonEmptyString })
    const promptSchema = Schema.Struct({ systemPrompt: Schema.String })
    const program = Effect.gen(function* program() {
      const created = yield* Effect.tryPromise(() =>
        client.request({
          config: nativeConversationConfig(origin),
          lifecycle: "resident",
          noSession: true,
          type: "create",
        }),
      )
      const initial = yield* Schema.decodeUnknownEffect(createdSchema)(requireSuccess(created))
      const firstPrompt = yield* Effect.tryPromise(() =>
        client.request({ activeSessionId: initial.activeSessionId, type: "get_system_prompt" }),
      )
      const first = yield* Schema.decodeUnknownEffect(promptSchema)(requireSuccess(firstPrompt))
      assert.ok(first.systemPrompt.includes(origin.instructions))

      // A durable synthetic transcript avoids inference while exercising real native resume.
      const manager = SessionManager.create(root, path.join(root, "sessions"))
      manager.appendMessage({ content: "Synthetic saved conversation", role: "user", timestamp: 1 })
      manager.flushNow()
      const sessionPath = manager.materializeSessionFile()
      const sessionId = manager.getSessionId()
      const opened = yield* Effect.tryPromise(() =>
        client.request({
          config: nativeConversationConfig(origin, true),
          lifecycle: "resident",
          sessionPath,
          type: "create",
        }),
      )
      yield* Schema.decodeUnknownEffect(createdSchema)(requireSuccess(opened))
      yield* Effect.tryPromise(() => stopDaemon(client, daemon))
      daemon = startDaemon(socketPath, agentDir)
      client = yield* Effect.tryPromise(() => connectDaemon(socketPath))
      const resumed = yield* Effect.tryPromise(() =>
        client.request({
          config: nativeConversationConfig(origin, true),
          lifecycle: "resident",
          sessionPath,
          type: "create",
        }),
      )
      const resumedSession = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ activeSessionId: Schema.NonEmptyString, sessionId: Schema.NonEmptyString }),
      )(requireSuccess(resumed))
      assert.equal(resumedSession.sessionId, sessionId)
      const response = yield* Effect.tryPromise(() =>
        client.request({
          activeSessionId: resumedSession.activeSessionId,
          type: "get_system_prompt",
        }),
      )
      const prompt = yield* Schema.decodeUnknownEffect(promptSchema)(requireSuccess(response))
      assert.ok(prompt.systemPrompt.includes(origin.instructions))
    })
    await Effect.runPromise(program)
  },
)

test(
  "Agent durability, reconciliation, and recovery through the real Zenbu service boundary",
  { timeout: 180_000 },
  async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "ernie-agent-roster-"))
    const socketPath = path.join(root, "daemon.sock")
    let daemon = startDaemon(socketPath, path.join(root, "agent"))
    let daemonClient = await connectDaemon(socketPath)
    const projectRoot = path.resolve(import.meta.dirname, "../..")
    const runtimeFile = path.join(root, "ernie", "runtime.json")
    const startHost = () =>
      spawn(process.execPath, ["scripts/dev.ts", "server"], {
        cwd: projectRoot,
        env: {
          ...process.env,
          ERNIE_DEV_OPEN_BROWSER: "0",
          ERNIE_DEV_PROFILE: `agent-roster-${process.pid}`,
          ERNIE_DEV_STATE_ROOT: path.join(root, "ernie"),
          ERNIE_PRIME_AGENT_SOCKET: socketPath,
          ERNIE_PRIME_AGENT_START_DAEMON: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      })
    let host = startHost()
    let closeRpc: (() => void) | undefined
    t.after(async () => {
      closeRpc?.()
      host.kill("SIGTERM")
      await waitForExit(host, 10_000)
      await stopDaemon(daemonClient, daemon)
      await rm(root, { force: true, recursive: true })
    })
    await waitForOutput(host, "Runtime:", 45_000)
    t.diagnostic("isolated service ready")
    let connection = await connectRosterRpc(runtimeFile)
    await connection.prime.connectDaemon()
    closeRpc = connection.close
    const settings = {
      avatar: "fern" as const,
      cwd: root,
      instructions: "Original role cedar-731",
      model: "",
      name: "Fixture Agent",
      provider: "",
      role: "Review",
    }
    // A root owned by another client is absent from Ernie's roster but reserves its name.
    await createSession(daemonClient, root, settings.name)
    const first = unwrapAgentResult(
      await connection.agents.save({ ...settings, expectedRevision: 0, id: "fixture-a" }),
    )
    assert.equal(first.name, "Fixture Agent 2")
    assert.equal(first.root?.status, "bound")
    unwrapAgentResult(
      await connection.agents.save({
        ...settings,
        expectedRevision: 0,
        id: "fixture-b",
        name: "Second Agent",
      }),
    )
    const rootFile = path.join(root, "ernie", "db", "root.json")
    const previousRootFile = path.join(root, "saved-root.json")
    await rename(rootFile, previousRootFile)
    await mkdir(rootFile)
    const unsaved = await connection.agents.save({
      ...settings,
      expectedRevision: first.revision,
      id: first.id,
      name: "Saved after retry",
    })
    assert.equal(unsaved.ok, false)
    await rmdir(rootFile)
    await rename(previousRootFile, rootFile)
    const retried = unwrapAgentResult(
      await connection.agents.save({
        ...settings,
        expectedRevision: first.revision,
        id: first.id,
        name: "Saved after retry",
      }),
    )
    assert.equal(retried.revision, first.revision + 1)
    const durableRoot = Schema.decodeUnknownSync(
      Schema.Struct({ app: Schema.Struct({ roster: Roster }) }),
    )(JSON.parse(await readFile(rootFile, "utf-8")))
    assert.equal(
      durableRoot.app.roster.agents.find((agent) => agent.id === first.id)?.name,
      "Saved after retry",
    )
    const { root: _importedRoot, ...unboundProfile } = first
    const importedRoster = {
      agents: [{ ...unboundProfile, id: "imported-agent" }],
      associations: [],
      selectedAgentId: null,
    }
    unwrapAgentResult(await connection.agents.reconcileRoster(importedRoster))
    assert.equal(
      unwrapAgentResult(await connection.agents.reconcileRoster(importedRoster)).addedAgents,
      0,
    )
    const conflictingImport = await connection.agents.reconcileRoster({
      ...importedRoster,
      agents: [{ ...unboundProfile, id: "imported-agent", instructions: "Conflicting origin" }],
    })
    assert.equal(conflictingImport.ok, false)

    const sessionId = unwrapAgentResult(
      await connection.agents.createConversation({
        agentId: first.id,
        requestId: "fixture-create",
      }),
    )
    assert.equal(
      unwrapAgentResult(
        await connection.agents.createConversation({
          agentId: first.id,
          requestId: "fixture-create",
        }),
      ),
      sessionId,
    )
    assert.equal(first.root?.sessionId, sessionId)
    assert.equal(
      unwrapAgentResult(
        await connection.agents.createConversation({
          agentId: first.id,
          requestId: "different-click",
        }),
      ),
      sessionId,
    )
    const duplicateAssignment = await connection.agents.assign({ agentId: "fixture-b", sessionId })
    assert.equal(duplicateAssignment.ok, false)
    const instructionChange = await connection.agents.save({
      ...settings,
      expectedRevision: retried.revision,
      id: first.id,
      instructions: "Future conversations only",
    })
    assert.equal(instructionChange.ok, false)
    const nativeList = requireSuccess(await daemonClient.request({ all: true, type: "list" })) as {
      sessions: { sessionId: string; sessionName?: string }[]
    }
    assert.equal(nativeList.sessions.filter((item) => item.sessionId === sessionId).length, 1)
    assert.equal(
      nativeList.sessions.find((item) => item.sessionId === sessionId)?.sessionName,
      "Saved after retry",
    )
    const collision = await connection.agents.save({
      ...settings,
      expectedRevision: retried.revision,
      id: first.id,
      name: "Second Agent",
    })
    assert.equal(collision.ok, false)
    const rejected = await connection.agents.assign({ agentId: "missing-agent", sessionId })
    assert.equal(rejected.ok, false)
    // Model a lost activation response: native root is already resident while Ernie has only prepared metadata.
    const prepared = SessionManager.create(root, path.join(root, "prepared-root"))
    prepared.appendSessionInfo("Prepared root")
    prepared.flushNow()
    const preparedPath = prepared.materializeSessionFile()
    requireSuccess(
      await daemonClient.request({
        config: { cwd: root },
        lifecycle: "resident",
        name: "Prepared root",
        sessionPath: preparedPath,
        type: "create",
      }),
    )
    const preparedAgent = {
      ...unboundProfile,
      id: "prepared-agent",
      name: "Prepared root",
      root: {
        sessionFile: preparedPath,
        sessionId: prepared.getSessionId(),
        status: "prepared" as const,
      },
    }
    unwrapAgentResult(
      await connection.agents.reconcileRoster({
        agents: [preparedAgent],
        associations: [
          { agentId: preparedAgent.id, sessionId: prepared.getSessionId(), visitedAt: 1 },
        ],
        selectedAgentId: null,
      }),
    )
    const resolved = await Promise.all(
      ["retry-1", "retry-2"].map((requestId) =>
        connection.agents.createConversation({ agentId: preparedAgent.id, requestId }),
      ),
    )
    assert.ok(resolved.every((result) => unwrapAgentResult(result) === prepared.getSessionId()))
    const resumedRoster = unwrapAgentResult(await connection.agents.getRoster())
    assert.equal(
      resumedRoster.agents.find((item) => item.id === preparedAgent.id)?.root?.status,
      "bound",
    )
    const duplicateRoot = await connection.agents.reconcileRoster({
      agents: [{ ...preparedAgent, id: "duplicate-native-root" }],
      associations: [],
      selectedAgentId: null,
    })
    assert.equal(duplicateRoot.ok, false)

    // Explicit legacy migration preserves two independent files and adopts native identity.
    const oldRoots = ["Older root", "Chosen root"].map((name) => {
      const manager = SessionManager.create(root, path.join(root, "legacy-roots"))
      manager.appendSessionInfo(name)
      manager.flushNow()
      return { name, path: manager.materializeSessionFile(), sessionId: manager.getSessionId() }
    })
    const createLegacyRoot = async (old: (typeof oldRoots)[number]) => {
      requireSuccess(
        await daemonClient.request({
          config: { cwd: root },
          lifecycle: "resident",
          name: old.name,
          sessionPath: old.path,
          type: "create",
        }),
      )
    }
    await Effect.runPromise(
      Effect.forEach((old: (typeof oldRoots)[number]) =>
        Effect.tryPromise(() => createLegacyRoot(old)),
      )(oldRoots),
    )
    const legacyAgent = { ...unboundProfile, id: "legacy-agent", name: "Legacy label" }
    unwrapAgentResult(
      await connection.agents.reconcileRoster({
        agents: [legacyAgent],
        associations: oldRoots.map((old) => ({
          agentId: legacyAgent.id,
          sessionId: old.sessionId,
          visitedAt: 1,
        })),
        selectedAgentId: null,
      }),
    )
    unwrapAgentResult(await connection.agents.select({ agentId: legacyAgent.id }))
    assert.equal(
      unwrapAgentResult(await connection.agents.getRoster()).agents.find(
        (item) => item.id === legacyAgent.id,
      )?.root,
      undefined,
    )
    const ambiguousRoot = await connection.agents.createConversation({
      agentId: legacyAgent.id,
      requestId: "ambiguous-root",
    })
    assert.equal(ambiguousRoot.ok, false)
    const [, chosenRoot] = oldRoots
    assert.ok(chosenRoot)
    const migrated = unwrapAgentResult(
      await connection.agents.bindRoot({
        agentId: legacyAgent.id,
        sessionId: chosenRoot.sessionId,
      }),
    )
    assert.equal(migrated.name, "Chosen root")
    assert.equal(migrated.root?.sessionId, chosenRoot.sessionId)
    assert.equal(
      unwrapAgentResult(await connection.agents.getRoster()).associations.filter(
        (item) => item.agentId === legacyAgent.id,
      ).length,
      2,
    )
    await Promise.all(
      oldRoots.map(async (old) => {
        const contents = await readFile(old.path, "utf-8")
        assert.ok(contents.includes(old.sessionId))
      }),
    )
    const epoch = await connection.prime.getSendEpoch()
    const send = {
      commandId: "receipt-fixture",
      content: "/name Receipt fixture",
      epoch,
      mode: "prompt" as const,
      sessionId,
    }
    // This native fixture returns an error for the prompt. Keep the uncertain
    // receipt across renderer reconnection rather than trying that command again.
    const receipts = await Promise.all([
      connection.prime.sendMessage(send),
      connection.prime.sendMessage(send),
    ])
    assert.equal(Schema.decodeUnknownSync(SendReceipt)(receipts[0]).status, "unknown")
    assert.deepEqual(receipts[0], receipts[1])
    connection.close()
    connection = await connectRosterRpc(runtimeFile)
    closeRpc = connection.close
    assert.deepEqual(await connection.prime.checkSend(send), receipts[0])
    const changedSend = await connection.prime.sendMessage({ ...send, content: "Different" })
    assert.equal(changedSend.status, "unknown")
    connection.close()
    host.kill("SIGTERM")
    assert.equal(await waitForExit(host, 10_000), true)
    t.diagnostic("durability and reconciliation verified; restarting isolated service")
    host = startHost()
    await waitForOutput(host, "Runtime:", 45_000)
    connection = await connectRosterRpc(runtimeFile)
    closeRpc = connection.close
    await connection.prime.connectDaemon()
    assert.notEqual(await connection.prime.getSendEpoch(), epoch)
    const restartedSend = await connection.prime.sendMessage(send)
    assert.equal(restartedSend.status, "unknown")
    const roster = Schema.decodeUnknownSync(Roster)(
      unwrapAgentResult(await connection.agents.getRoster()),
    )
    const association = roster.associations.find((item) => item.sessionId === sessionId)
    assert.equal(association?.agentId, first.id)
    assert.equal(association?.origin?.instructions, settings.instructions)
    assert.equal(association?.origin?.instructionRevision, first.instructionRevision)
    // Concurrent renderer requests must share one logical attachment.
    t.diagnostic("checking concurrent attachment before daemon restart")
    const attachments = await Promise.all(
      Array.from({ length: 3 }, () => connection.prime.attachSession({ sessionId })),
    )
    assert.equal(new Set(attachments.map((attachment) => attachment.generation)).size, 1)
    // Restart only the fixture daemon, then let Ernie recover itself.
    await stopDaemon(daemonClient, daemon)
    t.diagnostic("checking receipts while daemon is offline")
    const absentSend = {
      ...send,
      commandId: "absent-before-check",
      epoch: await connection.prime.getSendEpoch(),
    }
    const absentReceipt = await connection.prime.checkSend(absentSend)
    assert.equal(absentReceipt.status, "not-sent")
    const absentSendResult = await connection.prime.sendMessage(absentSend)
    assert.equal(absentSendResult.status, "not-sent")
    daemon = startDaemon(socketPath, path.join(root, "agent"))
    daemonClient = await connectDaemon(socketPath)
    await connection.prime.connectDaemon()
    t.diagnostic("checking attachment after daemon restart")
    await connection.prime.attachSession({ sessionId })
    const catalog = Schema.decodeUnknownSync(
      Schema.Struct({
        sessions: Schema.Array(
          Schema.Struct({
            activeSessionId: Schema.optionalKey(Schema.String),
            sessionId: Schema.optionalKey(Schema.String),
          }),
        ),
      }),
    )(requireSuccess(await daemonClient.request({ all: true, type: "list" })))
    const recoveredId = catalog.sessions.find(
      (session) => session.sessionId === sessionId,
    )?.activeSessionId
    assert.ok(recoveredId)
    const recoveredPrompt = Schema.decodeUnknownSync(
      Schema.Struct({ systemPrompt: Schema.String }),
    )(
      requireSuccess(
        await daemonClient.request({ activeSessionId: recoveredId, type: "get_system_prompt" }),
      ),
    )
    assert.ok(recoveredPrompt.systemPrompt.includes(settings.instructions))
    assert.equal(recoveredPrompt.systemPrompt.includes("Future conversations only"), false)
    const unassignment = await connection.agents.assign({ agentId: null, sessionId })
    assert.equal(unassignment.ok, false)
    const unassigned = Schema.decodeUnknownSync(Roster)(
      unwrapAgentResult(await connection.agents.getRoster()),
    )
    assert.equal(
      unassigned.associations.find((item) => item.sessionId === sessionId)?.agentId,
      first.id,
    )
    const invalidWorkspace = await connection.agents.save({
      ...settings,
      cwd: path.join(root, "absent"),
      expectedRevision: 0,
      id: "invalid-workspace",
    })
    assert.equal(invalidWorkspace.ok, false)
    const failedCreation = await connection.agents.createConversation({
      agentId: "invalid-workspace",
      requestId: "failed-create",
    })
    assert.equal(failedCreation.ok, false)
    const afterFailure = Schema.decodeUnknownSync(Roster)(
      unwrapAgentResult(await connection.agents.getRoster()),
    )
    assert.ok(afterFailure.agents.some((agent) => agent.id === "invalid-workspace"))
    assert.equal(
      afterFailure.associations.some((item) => item.agentId === "invalid-workspace"),
      false,
    )
  },
)
