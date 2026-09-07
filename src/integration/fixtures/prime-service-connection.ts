import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import type { Socket } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { app } from "electron"
import { Service, ServiceRuntime } from "@zenbujs/core/runtime"
import { Schema } from "effect"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { PrimeAgentService } from "../../main/prime-agent/service"
import type { PrimeSessionState } from "../../packages/prime-agent"

const commandEnvelope = Schema.Struct({
  command: Schema.Struct({ id: Schema.String, type: Schema.String }),
})

const verifyConnection = async () => {
  // Every endpoint and sentinel belongs to this fresh directory. No native daemon is launched.
  const directory = await mkdtemp(path.join(tmpdir(), "ernie-connection-"))
  const socketPath = path.join(directory, "daemon.sock")
  const sentinel = path.join(directory, "sessions-and-credentials-sentinel")
  await writeFile(sentinel, "fixture data must remain unchanged")
  const previousExecutable = process.env.ERNIE_PRIME_AGENT_EXECUTABLE
  process.env.ERNIE_PRIME_AGENT_EXECUTABLE = path.join(directory, "missing-prime-agent")
  const previousSocket = process.env.ERNIE_PRIME_AGENT_SOCKET
  process.env.ERNIE_PRIME_AGENT_SOCKET = socketPath
  const runtime = new ServiceRuntime()
  const peers = new Set<Socket>()
  const commands: string[] = []
  const states: PrimeSessionState[] = []
  let connections = 0
  let schemaRevision = 26
  const server = createServer((socket) => {
    connections += 1
    peers.add(socket)
    socket.on("close", () => peers.delete(socket))
    socket.write(
      `${JSON.stringify({
        appVersion: VERSION,
        protocol: DAEMON_PROTOCOL_INFO,
        schemaRevision,
        serverCapabilities: [],
        socketPath,
        type: "daemon_hello",
      })}\n`,
    )
    let buffer = ""
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n")
        const line = buffer.slice(0, end)
        buffer = buffer.slice(end + 1)
        const { command } = Schema.decodeUnknownSync(commandEnvelope)(JSON.parse(line))
        commands.push(command.type)
        socket.write(
          `${JSON.stringify({
            command: command.type,
            data: { sessions: [] },
            id: command.id,
            success: true,
            type: "response",
          })}\n`,
        )
      }
    })
  })
  const listen = async () => {
    const listening = once(server, "listening")
    server.listen(socketPath)
    await listening
  }
  const stopEndpoint = async () => {
    const closing = promisify(server.close.bind(server))()
    for (const peer of peers) {
      peer.destroy()
    }
    await closing
  }
  const waitForStatus = async (status: string, deadline = Date.now() + 8000): Promise<void> => {
    if (states.at(-1)?.connection?.state.status === status) {
      return
    }
    if (Date.now() >= deadline) {
      assert.fail(`connection did not become ${status}`)
    }
    await delay(25)
    return waitForStatus(status, deadline)
  }

  try {
    await listen()
    // Production Zenbu injection seam; inert dependencies never open a database or native session.
    const createFixtureService = (key: "rpc" | "agentStore") =>
      class extends Service.create({ key }) {
        readonly emit = {
          app: { primeSessionStateChanged: (state: PrimeSessionState) => states.push(state) },
        }
      }
    runtime.register(createFixtureService("rpc"))
    runtime.register(createFixtureService("agentStore"))
    runtime.register(PrimeAgentService)
    await runtime.whenIdle()
    const service = runtime.getSlot("primeAgent")?.instance
    assert.ok(service instanceof PrimeAgentService)
    const results = await Promise.all([service.connectDaemon(), service.connectDaemon()])
    assert.ok(results.every((state) => state.connection?.state.status === "connected"))
    assert.equal(connections, 1, "concurrent connects share one transport")
    assert.ok(
      commands.length > 0 && commands.every((command) => command === "list"),
      "fresh connect only reads the catalog",
    )

    await stopEndpoint()
    await waitForStatus("not-installed")
    await listen()
    await delay(1200)
    assert.equal(connections, 1, "exhausted recovery cannot reconnect without an explicit retry")
    const state1 = await service.getSessionState()
    assert.equal(state1.connection?.state.status, "not-installed")
    const state2 = await service.connectDaemon()
    assert.equal(state2.connection?.state.status, "connected")
    assert.equal(connections, 2)

    schemaRevision = 25
    const beforeIncompatible = commands.length
    for (const peer of peers) {
      peer.destroy()
    }
    await waitForStatus("incompatible")
    await delay(1200)
    assert.equal(connections, 3, "incompatible greetings stop on the first attempt")
    assert.equal(commands.length, beforeIncompatible, "rejected greetings cannot issue commands")
    schemaRevision = 26
    const state3 = await service.connectDaemon()
    assert.equal(state3.connection?.state.status, "connected")
    assert.equal(connections, 4, "explicit retry grants a fresh attempt budget")
    assert.ok(commands.every((command) => command === "list"))
    assert.equal(await readFile(sentinel, "utf-8"), "fixture data must remain unchanged")
    await runtime.shutdown()
    assert.equal(server.listening, true, "service disposal leaves the external endpoint alive")
    await assert.rejects(service.connectDaemon(), /shutting down/u)
    assert.equal(connections, 4)
    console.log(
      "external connection flow verified: startup, coalescing, missing installation, incompatibility, retry, disposal",
    )
  } finally {
    await runtime.shutdown()
    for (const peer of peers) {
      peer.destroy()
    }
    if (server.listening) {
      await promisify(server.close.bind(server))()
    }
    if (previousSocket === undefined) {
      delete process.env.ERNIE_PRIME_AGENT_SOCKET
    } else {
      process.env.ERNIE_PRIME_AGENT_SOCKET = previousSocket
    }
    if (previousExecutable === undefined) {
      delete process.env.ERNIE_PRIME_AGENT_EXECUTABLE
    } else {
      process.env.ERNIE_PRIME_AGENT_EXECUTABLE = previousExecutable
    }
    await rm(directory, { force: true, recursive: true })
  }
}

try {
  await verifyConnection()
  app.exit(0)
} catch (error) {
  console.error(error)
  app.exit(1)
}
