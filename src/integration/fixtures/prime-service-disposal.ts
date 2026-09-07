import { Session } from "node:inspector/promises"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"
import type { PrimeSessionChangeEnvelope } from "../../packages/prime-agent"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:net"
import type { Socket } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { setImmediate, setTimeout } from "node:timers/promises"
import { promisify } from "node:util"
import { app } from "electron"
import { Service, ServiceRuntime } from "@zenbujs/core/runtime"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { Schema } from "effect"
import { PrimeAgentService } from "../../main/prime-agent/service"

const commandEnvelope = Schema.Struct({
  command: Schema.Struct({ id: Schema.String, type: Schema.String }),
})

const verifyDisposal = async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ernie-disposal-"))
  const socketPath = path.join(directory, "daemon.sock")
  const previousSocket = process.env.ERNIE_PRIME_AGENT_SOCKET
  process.env.ERNIE_PRIME_AGENT_SOCKET = socketPath
  const peers = new Set<Socket>()
  let connections = 0
  const attached = Promise.withResolvers<null>()
  const commands: string[] = []
  const refreshBurst = process.argv.includes("--refresh-burst")
  const reading = Promise.withResolvers<null>()
  const updated = Promise.withResolvers<null>()
  let releaseRead: (() => void) | undefined
  let heldRead = false
  let latestName = "initial"
  const { state } = createPrimeUsefulSessionFixture({
    cwd: directory,
    id: "saved-fixture",
    state: "idle",
  })
  const messages = Array.from({ length: 1000 }, (_, index) => ({
    content: `fixture message ${index}`,
    role: "user",
    timestamp: index,
  }))
  const nativeState = () => ({
    ...state,
    activeSessionId: "active-fixture",
    sessionName: latestName,
  })
  const server = createServer((socket) => {
    connections += 1
    peers.add(socket)
    socket.on("close", () => peers.delete(socket))
    socket.write(
      `${JSON.stringify({ appVersion: VERSION, protocol: DAEMON_PROTOCOL_INFO, schemaRevision: 26, serverCapabilities: [], socketPath, type: "daemon_hello" })}\n`,
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
        if (command.type === "list") {
          socket.write(
            `${JSON.stringify({ command: "list", data: { sessions: [{ activeSessionId: "active-fixture", activity: "idle", cwd: directory, id: "active-fixture", lifecycle: "live", sessionId: "saved-fixture" }] }, id: command.id, success: true, type: "response" })}\n`,
          )
        }
        const respond = (data: unknown) =>
          socket.write(
            `${JSON.stringify({ command: command.type, data, id: command.id, success: true, type: "response" })}\n`,
          )
        if (command.type === "attach") {
          attached.resolve(null)
          if (refreshBurst) {
            respond({
              activeSessionId: "active-fixture",
              snapshot: {
                messages,
                state: nativeState(),
                summary: { sessionId: "saved-fixture" },
              },
            })
          }
        }
        if (command.type === "get_connection_state") {
          const capturedState = nativeState()
          if (heldRead) {
            respond(nativeState())
          } else {
            heldRead = true
            releaseRead = () => respond(capturedState)
            reading.resolve(null)
          }
        }
        if (command.type === "get_messages") {
          respond({ messages })
        }
        if (command.type === "get_session_context") {
          respond({
            context: { messages: [], model: null, serviceTier: "auto", thinkingLevel: "off" },
          })
        }
        if (command.type === "detach") {
          respond({})
        }
        // Hold the native attach acknowledgement until shutdown closes its socket.
      }
    })
  })
  const runtime = new ServiceRuntime()
  const cleanup = async () => {
    await runtime.shutdown()
    if (previousSocket === undefined) {
      delete process.env.ERNIE_PRIME_AGENT_SOCKET
    } else {
      process.env.ERNIE_PRIME_AGENT_SOCKET = previousSocket
    }
    for (const peer of peers) {
      peer.destroy()
    }
    await promisify(server.close.bind(server))()
    await rm(directory, { force: true, recursive: true })
  }
  try {
    const listening = once(server, "listening")
    server.listen(socketPath)
    await listening

    // Register inert dependencies through Zenbu's production service injection seam.
    // This fixture never opens a database, workbench, or real session.
    const createFixtureService = (key: "rpc" | "agentStore") =>
      class extends Service.create({ key }) {
        readonly emit = {
          app: {
            primeSessionChanged: (event: PrimeSessionChangeEnvelope) => {
              if (event.change.type === "session" && event.change.session.name === "latest") {
                updated.resolve(null)
              }
            },
            primeSessionStateChanged: () => {
              // State notifications are intentionally ignored by this fixture.
            },
          },
        }
      }
    runtime.register(createFixtureService("rpc"))
    runtime.register(createFixtureService("agentStore"))
    runtime.register(PrimeAgentService)
    await runtime.whenIdle()
    const service = runtime.getSlot("primeAgent")?.instance
    assert.ok(service instanceof PrimeAgentService)
    if (refreshBurst) {
      await service.attachSession({ sessionId: "saved-fixture" })
      const inspector = new Session()
      inspector.connect()
      try {
        await inspector.post("Profiler.enable")
        await inspector.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true })
        await inspector.post("Profiler.takePreciseCoverage")
        const sendBurst = (offset: number) => {
          const payload = `${Array.from({ length: 100 }, (_, index) =>
            JSON.stringify({
              activeSessionId: "active-fixture",
              event: { name: latestName, type: "session_info_changed" },
              meta: { sequence: offset + index + 1 },
              type: "session_event",
            }),
          ).join("\n")}\n`
          for (const peer of peers) {
            peer.write(payload)
          }
        }
        latestName = "first"
        sendBurst(0)
        await reading.promise
        latestName = "latest"
        sendBurst(100)
        // Let the second burst reach the client while the first snapshot is held.
        await setTimeout(25)
        releaseRead?.()
        await updated.promise
        await setImmediate()
        const coverage = await inspector.post("Profiler.takePreciseCoverage")
        const projections = coverage.result
          .flatMap((script) => script.functions)
          .filter((entry) => entry.functionName === "projectPrimeSessionSnapshot")
          .reduce((count, entry) => count + (entry.ranges[0]?.count ?? 0), 0)
        console.log(`200 events / 1000 messages: ${projections} snapshot projections`)
        assert.ok(
          projections > 0 && projections <= 2,
          "bursts must require at most the active projection and one follow-up",
        )
        const attachment = await service.attachSession({ sessionId: "saved-fixture" })
        assert.equal(attachment.snapshot.session.name, "latest")
      } finally {
        await inspector.post("Profiler.stopPreciseCoverage")
        inspector.disconnect()
      }
    } else {
      let settled = false
      const pending = (async () => {
        try {
          await service.attachSession({ sessionId: "saved-fixture" })
        } catch (error) {
          settled = true
          attached.reject(error)
          return
        }
        settled = true
        assert.fail("shutdown must reject the unfinished attachment")
      })()
      await attached.promise
      await runtime.shutdown()
      assert.equal(settled, true, "shutdown must join attachment cleanup")
      await pending
      const connectionsAtShutdown = connections
      await assert.rejects(service.attachSession({ sessionId: "saved-fixture" }), /shutting down/u)
      await assert.rejects(service.getSessionState(), /shutting down/u)
      assert.equal(
        connections,
        connectionsAtShutdown,
        "disposed services must not acquire another socket",
      )
      assert.equal(server.listening, true, "the external daemon endpoint must remain available")
      assert.equal(commands.includes("shutdown"), false)
    }
  } finally {
    await cleanup()
  }
}

const main = async () => {
  try {
    await verifyDisposal()
    console.log("service disposal verified")
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}

void main()
