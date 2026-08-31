import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  DaemonAgentConnection,
  DaemonClient,
  type AgentConnectionEvent,
  type DaemonResponse,
} from "prime-agent"
import { z } from "zod"

const createdSessionSchema = z.object({
  activeSessionId: z.string().min(1),
})

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

function startDaemon(socketPath: string, agentDir: string) {
  const packageEntry = import.meta.resolve("prime-agent")
  const cliPath = fileURLToPath(new URL("./bundle/cli.js", packageEntry))
  return spawn(
    process.execPath,
    [cliPath, "--mode", "daemon", "--daemon-socket", socketPath],
    {
      env: {
        ...process.env,
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
  return createdSessionSchema.parse(data).activeSessionId
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
  if (child.exitCode !== null) return Promise.resolve(true)

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
