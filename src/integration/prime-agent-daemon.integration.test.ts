import { connectRpc } from "@zenbujs/core/rpc"
import { RuntimeDescriptor } from "../dev/runtime-descriptor"
import type { PrimeAgentService } from "../main/prime-agent/service"
import type { AgentsService } from "../main/services/agents"
import { type AgentResult, Roster } from "../packages/agents"
import { Effect } from "effect"
import { SendReceipt } from "../packages/prime-agent"
import { SessionManager } from "prime-agent"
import { nativeConversationConfig } from "../main/prime-agent/agent-config"
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, readFile, rm, stat, mkdir, rename, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  DaemonAgentConnection,
  DaemonClient,
  type AgentConnectionEvent,
  type DaemonResponse,
} from "prime-agent"
import { Schema } from "effect"

const createdSessionSchema = Schema.Struct({
  activeSessionId: Schema.NonEmptyString,
})

// @lat: [[tests#Behavior specifications#Daemon boundary#Logical attachment isolation]]
test("one daemon client isolates two logical session attachments", { timeout: 30_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ernie-prime-agent-"))
  const socketPath = join(root, "daemon.sock")
  const agentDir = join(root, "agent")
  const daemon = startDaemon(socketPath, agentDir)
  const client = await connectDaemon(socketPath)
  const connections: DaemonAgentConnection[] = []

  t.after(async () => {
    await Promise.allSettled(connections.map((connection) => connection.dispose()))
    await stopDaemon(client, daemon)
    await rm(root, { recursive: true, force: true })
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

  const firstRename = waitForEvent(first, (event) =>
    event.type === "session_event" && event.event.type === "session_info_changed"
  )
  const secondRename = waitForEvent(second, (event) =>
    event.type === "session_event" && event.event.type === "session_info_changed"
  )
  await Promise.all([
    first.setSessionName("renamed first session"),
    second.setSessionName("renamed second session"),
  ])
  const [firstRenameEvent, secondRenameEvent] = await Promise.all([
    firstRename,
    secondRename,
  ])

  assert.equal(firstRenameEvent.type, "session_event")
  assert.equal(firstRenameEvent.event.type, "session_info_changed")
  assert.equal(firstRenameEvent.event.name, "renamed first session")
  assert.equal(secondRenameEvent.type, "session_event")
  assert.equal(secondRenameEvent.event.type, "session_info_changed")
  assert.equal(secondRenameEvent.event.name, "renamed second session")
  assert.equal(
    firstEvents.some((event) =>
      event.type === "session_event" &&
      event.event.type === "session_info_changed" &&
      event.event.name === "renamed second session"
    ),
    false,
  )
  assert.equal(
    secondEvents.some((event) =>
      event.type === "session_event" &&
      event.event.type === "session_info_changed" &&
      event.event.name === "renamed first session"
    ),
    false,
  )
})

// @lat: [[tests#Behavior specifications#Daemon boundary#External daemon ownership]]
test("Ernie cleanup leaves an external Prime Agent daemon running", { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ernie-external-prime-agent-"))
  const socketPath = join(root, "daemon.sock")
  const agentDir = join(root, "agent")
  const daemon = startDaemon(socketPath, agentDir)
  const daemonClient = await connectDaemon(socketPath)
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  const development = spawn("nub", ["--node", "scripts/dev.ts", "server"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ERNIE_DEV_OPEN_BROWSER: "0",
      ERNIE_DEV_PROFILE: `external-daemon-${process.pid}`,
      ERNIE_DEV_STATE_ROOT: join(root, "ernie"),
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
    await rm(root, { recursive: true, force: true })
  })

  await waitForOutput(development, "Runtime:", 45_000)
  development.kill("SIGTERM")
  assert.equal(await waitForExit(development, 10_000), true)

  assert.equal(daemon.exitCode, null)
  assert.equal((await stat(socketPath)).isSocket(), true)
  const survivingClient = await connectDaemon(socketPath)
  try {
    requireSuccess(await survivingClient.request({ type: "list" }))
  } finally {
    survivingClient.close()
  }
})

function startDaemon(socketPath: string, agentDir: string) {
  const packageEntry = import.meta.resolve("prime-agent")
  const cliPath = fileURLToPath(new URL("./bundle/cli.js", packageEntry))
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (name.startsWith("PRIME_AGENT_INTERNAL_")) delete environment[name]
  }
  return spawn(
    process.execPath,
    [cliPath, "--mode", "daemon", "--daemon-socket", socketPath],
    {
      env: {
        ...environment,
        ELECTRON_RUN_AS_NODE: "1",
        PRIME_AGENT_CODING_AGENT_DIR: agentDir,
      },
      stdio: "ignore",
    },
  )
}

async function connectDaemon(socketPath: string) {
  const deadline = Date.now() + 10_000
  let lastError: unknown

  while (Date.now() < deadline) {
    const client = new DaemonClient(socketPath)
    try {
      await client.connect(500)
      await client.waitForHello(1_000)
      client.enableRequestRecovery()
      return client
    } catch (error) {
      lastError = error
      client.close()
      await delay(100)
    }
  }

  throw new Error("The isolated Prime Agent daemon did not become ready", {
    cause: lastError,
  })
}

async function createSession(
  client: DaemonClient,
  cwd: string,
  name: string,
) {
  const response = await client.request({
    type: "create",
    noSession: true,
    name,
    config: { cwd },
    lifecycle: "resident",
  })
  const data = requireSuccess(response)
  return Schema.decodeUnknownSync(createdSessionSchema)(data).activeSessionId
}

function requireSuccess(response: DaemonResponse) {
  if (!response.success) throw new Error(response.error)
  return response.data
}

function waitForEvent(
  connection: DaemonAgentConnection,
  predicate: (event: AgentConnectionEvent) => boolean,
) {
  return new Promise<AgentConnectionEvent>((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe()
      reject(new Error("Timed out waiting for a Prime Agent session event"))
    }, 5_000)
    const unsubscribe = connection.subscribe((event) => {
      if (!predicate(event)) return
      clearTimeout(timeout)
      unsubscribe()
      resolve(event)
    })
  })
}

function waitForOutput(child: ChildProcess, expected: string, timeoutMs: number) {
  const stdout = child.stdout
  const stderr = child.stderr
  if (!stdout || !stderr) throw new Error("Ernie development output is unavailable")

  return new Promise<void>((resolvePromise, reject) => {
    let output = ""
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${expected}`)), timeoutMs)
    const onData = (chunk: Buffer | string) => {
      output += chunk.toString()
      if (output.includes(expected)) finish()
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(new Error(`Ernie development exited before readiness (${code ?? signal ?? "unknown"}): ${output.slice(-3000)}`))
    }
    const finish = (error?: Error) => {
      clearTimeout(timeout)
      stdout.off("data", onData)
      stderr.off("data", onData)
      child.off("exit", onExit)
      if (error) reject(error)
      else resolvePromise()
    }
    stdout.on("data", onData)
    stderr.on("data", onData)
    child.once("exit", onExit)
  })
}

async function stopDaemon(client: DaemonClient, daemon: ChildProcess) {
  await client.request({ type: "shutdown", force: true }, 5_000).catch(() => undefined)
  client.close()
  if (daemon.exitCode !== null) return

  const exited = await waitForExit(daemon, 3_000)
  if (exited) return

  daemon.kill("SIGTERM")
  await waitForExit(daemon, 2_000)
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("exit", onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    child.once("exit", onExit)
  })
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

// Opt-in daemon integration: no model request or provider credentials are required.
test("Agent instructions survive native resume after daemon restart", { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ernie-agent-origin-"))
  const socketPath = join(root, "daemon.sock")
  const agentDir = join(root, "agent")
  let daemon = startDaemon(socketPath, agentDir)
  let client = await connectDaemon(socketPath)
  t.after(async () => {
    await stopDaemon(client, daemon)
    await rm(root, { recursive: true, force: true })
  })
  const origin = {
    agentId: "fixture-agent", instructionRevision: 1,
    instructions: "Use the original fixture role: cedar-731.", cwd: root, provider: "", model: "",
  }
  const createdSchema = Schema.Struct({ activeSessionId: Schema.NonEmptyString })
  const promptSchema = Schema.Struct({ systemPrompt: Schema.String })
  const program = Effect.gen(function* () {
    const created = yield* Effect.tryPromise(() => client.request({ type: "create", noSession: true, config: nativeConversationConfig(origin), lifecycle: "resident" }))
    const initial = yield* Schema.decodeUnknownEffect(createdSchema)(requireSuccess(created))
    const firstPrompt = yield* Effect.tryPromise(() => client.request({ type: "get_system_prompt", activeSessionId: initial.activeSessionId }))
    const first = yield* Schema.decodeUnknownEffect(promptSchema)(requireSuccess(firstPrompt))
    assert.ok(first.systemPrompt.includes(origin.instructions))

    // A durable synthetic transcript avoids inference while exercising real native resume.
    const manager = SessionManager.create(root, join(root, "sessions"))
    manager.appendMessage({ role: "user", content: "Synthetic saved conversation", timestamp: 1 })
    manager.flushNow()
    const sessionPath = manager.materializeSessionFile()
    const sessionId = manager.getSessionId()
    const opened = yield* Effect.tryPromise(() => client.request({ type: "create", sessionPath, config: nativeConversationConfig(origin, true), lifecycle: "resident" }))
    yield* Schema.decodeUnknownEffect(createdSchema)(requireSuccess(opened))
    yield* Effect.tryPromise(() => stopDaemon(client, daemon))
    daemon = startDaemon(socketPath, agentDir)
    client = yield* Effect.tryPromise(() => connectDaemon(socketPath))
    const resumed = yield* Effect.tryPromise(() => client.request({ type: "create", sessionPath, config: nativeConversationConfig(origin, true), lifecycle: "resident" }))
    const resumedSession = yield* Schema.decodeUnknownEffect(Schema.Struct({ activeSessionId: Schema.NonEmptyString, sessionId: Schema.NonEmptyString }))(requireSuccess(resumed))
    assert.equal(resumedSession.sessionId, sessionId)
    const response = yield* Effect.tryPromise(() => client.request({ type: "get_system_prompt", activeSessionId: resumedSession.activeSessionId }))
    const prompt = yield* Schema.decodeUnknownEffect(promptSchema)(requireSuccess(response))
    assert.ok(prompt.systemPrompt.includes(origin.instructions))
  })
  await Effect.runPromise(program)
})


test("Agent durability, reconciliation, and recovery through the real Zenbu service boundary", { timeout: 180_000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ernie-agent-roster-"))
  const socketPath = join(root, "daemon.sock")
  let daemon = startDaemon(socketPath, join(root, "agent"))
  let daemonClient = await connectDaemon(socketPath)
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
  const runtimeFile = join(root, "ernie", "runtime.json")
  const startHost = () => spawn(process.execPath, ["scripts/dev.ts", "server"], {
    cwd: projectRoot,
    env: { ...process.env, ERNIE_DEV_OPEN_BROWSER: "0", ERNIE_DEV_PROFILE: `agent-roster-${process.pid}`, ERNIE_DEV_STATE_ROOT: join(root, "ernie"), ERNIE_PRIME_AGENT_SOCKET: socketPath },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let host = startHost()
  let closeRpc: (() => void) | undefined
  t.after(async () => {
    closeRpc?.()
    host.kill("SIGTERM")
    await waitForExit(host, 10_000)
    await stopDaemon(daemonClient, daemon)
    await rm(root, { recursive: true, force: true })
  })
  await waitForOutput(host, "Runtime:", 45_000)
  t.diagnostic("isolated service ready")
  let connection = await connectRosterRpc(runtimeFile)
  closeRpc = connection.close
  const settings = { name: "Fixture Agent", avatar: "fern" as const, role: "Review", instructions: "Original role cedar-731", cwd: root, provider: "", model: "" }
  const first = unwrapAgentResult(await connection.agents.save({ ...settings, id: "fixture-a", expectedRevision: 0 }))
  unwrapAgentResult(await connection.agents.save({ ...settings, id: "fixture-b", name: "Second Agent", expectedRevision: 0 }))
  const rootFile = join(root, "ernie", "db", "root.json")
  const previousRootFile = join(root, "saved-root.json")
  await rename(rootFile, previousRootFile)
  await mkdir(rootFile)
  const unsaved = await connection.agents.save({ ...settings, name: "Saved after retry", id: first.id, expectedRevision: first.revision })
  assert.equal(unsaved.ok, false)
  await rmdir(rootFile)
  await rename(previousRootFile, rootFile)
  const retried = unwrapAgentResult(await connection.agents.save({ ...settings, name: "Saved after retry", id: first.id, expectedRevision: first.revision }))
  assert.equal(retried.revision, first.revision + 1)
  const durableRoot = Schema.decodeUnknownSync(Schema.Struct({ app: Schema.Struct({ roster: Roster }) }))(JSON.parse(await readFile(rootFile, "utf8")))
  assert.equal(durableRoot.app.roster.agents.find((agent) => agent.id === first.id)?.name, "Saved after retry")
  const importedRoster = { agents: [{ ...first, id: "imported-agent" }], associations: [], selectedAgentId: null }
  unwrapAgentResult(await connection.agents.reconcileRoster(importedRoster))
  assert.equal(unwrapAgentResult(await connection.agents.reconcileRoster(importedRoster)).addedAgents, 0)
  assert.equal((await connection.agents.reconcileRoster({ ...importedRoster, agents: [{ ...first, id: "imported-agent", instructions: "Conflicting origin" }] })).ok, false)

  const sessionId = unwrapAgentResult(await connection.agents.createConversation({ agentId: first.id, requestId: "fixture-create" }))
  assert.equal(unwrapAgentResult(await connection.agents.createConversation({ agentId: first.id, requestId: "fixture-create" })), sessionId)
  unwrapAgentResult(await connection.agents.assign({ sessionId, agentId: "fixture-b" }))
  unwrapAgentResult(await connection.agents.save({ ...settings, id: first.id, instructions: "Future conversations only", expectedRevision: retried.revision }))
  const rejected = await connection.agents.assign({ sessionId, agentId: "missing-agent" })
  assert.equal(rejected.ok, false)
  const epoch = await connection.prime.getSendEpoch()
  const send = { epoch, commandId: "receipt-fixture", sessionId, content: "/name Receipt fixture", mode: "prompt" as const }
  // This native fixture returns an error for the prompt. Keep the uncertain
  // receipt across renderer reconnection rather than trying that command again.
  const receipts = await Promise.all([connection.prime.sendMessage(send), connection.prime.sendMessage(send)])
  assert.equal(Schema.decodeUnknownSync(SendReceipt)(receipts[0]).status, "unknown")
  assert.deepEqual(receipts[0], receipts[1])
  connection.close()
  connection = await connectRosterRpc(runtimeFile)
  closeRpc = connection.close
  assert.deepEqual(await connection.prime.sendMessage(send), receipts[0])
  assert.equal((await connection.prime.sendMessage({ ...send, content: "Different" })).status, "unknown")
  connection.close()
  host.kill("SIGTERM")
  assert.equal(await waitForExit(host, 10_000), true)
  t.diagnostic("durability and reconciliation verified; restarting isolated service")
  host = startHost()
  await waitForOutput(host, "Runtime:", 45_000)
  connection = await connectRosterRpc(runtimeFile)
  closeRpc = connection.close
  assert.notEqual(await connection.prime.getSendEpoch(), epoch)
  assert.equal((await connection.prime.sendMessage(send)).status, "unknown")
  const roster = Schema.decodeUnknownSync(Roster)(unwrapAgentResult(await connection.agents.getRoster()))
  const association = roster.associations.find((item) => item.sessionId === sessionId)
  assert.equal(association?.agentId, "fixture-b")
  assert.equal(association?.origin?.instructions, settings.instructions)
  assert.equal(association?.origin?.instructionRevision, first.instructionRevision)
  // Attach through Ernie, restart only the fixture daemon, then let Ernie recover itself.
  await connection.prime.attachSession({ sessionId })
  await stopDaemon(daemonClient, daemon)
  daemon = startDaemon(socketPath, join(root, "agent"))
  daemonClient = await connectDaemon(socketPath)
  await connection.prime.attachSession({ sessionId })
  const catalog = Schema.decodeUnknownSync(Schema.Struct({ sessions: Schema.Array(Schema.Struct({ sessionId: Schema.optionalKey(Schema.String), activeSessionId: Schema.optionalKey(Schema.String) })) }))(requireSuccess(await daemonClient.request({ type: "list", all: true })))
  const recoveredId = catalog.sessions.find((session) => session.sessionId === sessionId)?.activeSessionId
  assert.ok(recoveredId)
  const recoveredPrompt = Schema.decodeUnknownSync(Schema.Struct({ systemPrompt: Schema.String }))(requireSuccess(await daemonClient.request({ type: "get_system_prompt", activeSessionId: recoveredId })))
  assert.ok(recoveredPrompt.systemPrompt.includes(settings.instructions))
  assert.equal(recoveredPrompt.systemPrompt.includes("Future conversations only"), false)
  unwrapAgentResult(await connection.agents.assign({ sessionId, agentId: null }))
  const unassigned = Schema.decodeUnknownSync(Roster)(unwrapAgentResult(await connection.agents.getRoster()))
  assert.equal(unassigned.associations.find((item) => item.sessionId === sessionId)?.agentId, null)
  unwrapAgentResult(await connection.agents.save({ ...settings, id: "invalid-workspace", cwd: join(root, "absent"), expectedRevision: 0 }))
  const failedCreation = await connection.agents.createConversation({ agentId: "invalid-workspace", requestId: "failed-create" })
  assert.equal(failedCreation.ok, false)
  const afterFailure = Schema.decodeUnknownSync(Roster)(unwrapAgentResult(await connection.agents.getRoster()))
  assert.ok(afterFailure.agents.some((agent) => agent.id === "invalid-workspace"))
  assert.equal(afterFailure.associations.some((item) => item.agentId === "invalid-workspace"), false)
})

function unwrapAgentResult<A>(result: AgentResult<A>): A {
  if (!result.ok) throw new Error(result.error)
  return result.value
}

async function connectRosterRpc(runtimeFile: string) {
  const descriptor = Schema.decodeUnknownSync(RuntimeDescriptor)(JSON.parse(await readFile(runtimeFile, "utf8")))
  const url = new URL(descriptor.origin)
  url.protocol = "ws:"
  url.searchParams.set("token", descriptor.authToken)
  const socket = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true })
    socket.addEventListener("error", () => reject(new Error("Fixture RPC connection failed")), { once: true })
  })
  const frame = Schema.Struct({ ch: Schema.String, data: Schema.String })
  const rpc = await connectRpc<{ app: { agents: Pick<AgentsService, "getRoster" | "save" | "assign" | "createConversation" | "reconcileRoster">; primeAgent: Pick<PrimeAgentService, "attachSession" | "getSendEpoch" | "sendMessage"> } }>({
    version: "0",
    send: (data) => socket.send(JSON.stringify({ ch: "rpc", data })),
    subscribe: (callback) => {
      const handler = (event: MessageEvent) => {
        if (typeof event.data !== "string") return
        const parsed = Schema.decodeUnknownOption(frame)(JSON.parse(event.data))
        if (parsed._tag === "Some" && parsed.value.ch === "rpc") callback(parsed.value.data)
      }
      socket.addEventListener("message", handler)
      return () => socket.removeEventListener("message", handler)
    },
  })
  return { agents: rpc.server.app.agents, prime: rpc.server.app.primeAgent, close: () => { rpc.disconnect(); socket.close() } }
}
