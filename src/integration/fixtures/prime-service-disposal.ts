import { Session } from "node:inspector/promises"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"
import type { PrimeSessionChangeEnvelope } from "../../packages/prime-agent"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { app } from "electron"
import { Service, ServiceRuntime } from "@zenbujs/core/runtime"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { Schema } from "effect"
import { PrimeAgentService } from "../../main/prime-agent/service"

const commandEnvelope = Schema.Struct({ command: Schema.Struct({ id: Schema.String, type: Schema.String }) })

async function verifyDisposal() {
  const directory = await mkdtemp(join(tmpdir(), "ernie-disposal-"))
  const socketPath = join(directory, "daemon.sock")
  const previousSocket = process.env.ERNIE_PRIME_AGENT_SOCKET
  process.env.ERNIE_PRIME_AGENT_SOCKET = socketPath
  const peers = new Set<Socket>()
  let connections = 0
  const attached = Promise.withResolvers<void>()
  const commands: string[] = []
  const refreshBurst = process.argv.includes("--refresh-burst")
  const reading = Promise.withResolvers<void>()
  const updated = Promise.withResolvers<void>()
  let releaseRead = () => {}
  let heldRead = false
  let latestName = "initial"
  const state = createPrimeUsefulSessionFixture({ id: "saved-fixture", cwd: directory, state: "idle" }).state
  const messages = Array.from({ length: 1_000 }, (_, index) => ({ role: "user", content: `fixture message ${index}`, timestamp: index }))
  const nativeState = () => ({ ...state, activeSessionId: "active-fixture", sessionName: latestName })
  const server = createServer((socket) => {
    connections += 1
    peers.add(socket)
    socket.on("close", () => peers.delete(socket))
    socket.write(`${JSON.stringify({ type: "daemon_hello", socketPath, protocol: DAEMON_PROTOCOL_INFO,
      appVersion: VERSION, schemaRevision: 26, serverCapabilities: [] })}\n`)
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
          socket.write(`${JSON.stringify({ type: "response", id: command.id, command: "list", success: true,
            data: { sessions: [{ id: "active-fixture", activeSessionId: "active-fixture", sessionId: "saved-fixture", lifecycle: "live", activity: "idle", cwd: directory }] } })}\n`)
        }
        const respond = (data: unknown) => socket.write(`${JSON.stringify({ type: "response", id: command.id, command: command.type, success: true, data })}\n`)
        if (command.type === "attach") {
          attached.resolve()
          if (refreshBurst) respond({ activeSessionId: "active-fixture", snapshot: {
            summary: { sessionId: "saved-fixture" }, state: nativeState(), messages,
          } })
        }
        if (command.type === "get_connection_state") {
          const capturedState = nativeState()
          if (!heldRead) {
            heldRead = true
            releaseRead = () => respond(capturedState)
            reading.resolve()
          } else respond(nativeState())
        }
        if (command.type === "get_messages") respond({ messages })
        if (command.type === "get_session_context") respond({ context: { messages: [], thinkingLevel: "off", serviceTier: "auto", model: null } })
        if (command.type === "detach") respond({})
        // Hold the native attach acknowledgement until shutdown closes its socket.
      }
    })
  })
  const runtime = new ServiceRuntime()
  const cleanup = async () => {
    await runtime.shutdown()
    if (previousSocket === undefined) delete process.env.ERNIE_PRIME_AGENT_SOCKET
    else process.env.ERNIE_PRIME_AGENT_SOCKET = previousSocket
    for (const peer of peers) peer.destroy()
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    await rm(directory, { recursive: true, force: true })
  }
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve) })

    // Register inert dependencies through Zenbu's production service injection seam.
    // This fixture never opens a database, workbench, or real session.
    class FixtureRpc extends Service.create({ key: "rpc" }) {
      readonly emit = { app: {
        primeSessionStateChanged: () => {},
        primeSessionChanged: (event: PrimeSessionChangeEnvelope) => {
          if (event.change.type === "session" && event.change.session.name === "latest") updated.resolve()
        },
      } }
    }
    class FixtureAgentStore extends Service.create({ key: "agentStore" }) {}
    runtime.register(FixtureRpc)
    runtime.register(FixtureAgentStore)
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
          const payload = Array.from({ length: 100 }, (_, index) => JSON.stringify({
            type: "session_event", activeSessionId: "active-fixture",
            meta: { sequence: offset + index + 1 },
            event: { type: "session_info_changed", name: latestName },
          })).join("\n") + "\n"
          for (const peer of peers) peer.write(payload)
        }
        latestName = "first"
        sendBurst(0)
        await reading.promise
        latestName = "latest"
        sendBurst(100)
        // Let the second burst reach the client while the first snapshot is held.
        await new Promise((resolve) => setTimeout(resolve, 25))
        releaseRead()
        await updated.promise
        await new Promise((resolve) => setImmediate(resolve))
        const coverage = await inspector.post("Profiler.takePreciseCoverage")
        const projections = coverage.result.flatMap((script) => script.functions)
          .filter((entry) => entry.functionName === "projectPrimeSessionSnapshot")
          .reduce((count, entry) => count + (entry.ranges[0]?.count ?? 0), 0)
        console.log(`200 events / 1000 messages: ${projections} snapshot projections`)
        assert.ok(projections > 0 && projections <= 2, "bursts must require at most the active projection and one follow-up")
        assert.equal((await service.attachSession({ sessionId: "saved-fixture" })).snapshot.session.name, "latest")
      } finally {
        await inspector.post("Profiler.stopPreciseCoverage")
        inspector.disconnect()
      }
    } else {
      let settled = false
      const pending = service.attachSession({ sessionId: "saved-fixture" }).then(
        () => { settled = true; assert.fail("shutdown must reject the unfinished attachment") },
        (error: unknown) => { settled = true; attached.reject(error) },
      )
      await attached.promise
      await runtime.shutdown()
      assert.equal(settled, true, "shutdown must join attachment cleanup")
      await pending
      const connectionsAtShutdown = connections
      await assert.rejects(service.attachSession({ sessionId: "saved-fixture" }), /shutting down/)
      await assert.rejects(service.getSessionState(), /shutting down/)
      assert.equal(connections, connectionsAtShutdown, "disposed services must not acquire another socket")
      assert.equal(server.listening, true, "the external daemon endpoint must remain available")
      assert.equal(commands.includes("shutdown"), false)
    }
  } finally { await cleanup() }
}

void verifyDisposal().then(() => { console.log("service disposal verified"); app.exit(0) }, (error: unknown) => { console.error(error); app.exit(1) })
