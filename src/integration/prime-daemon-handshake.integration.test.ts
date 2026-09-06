import assert from "node:assert/strict"
import { createServer, type Socket } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { connectPrimeDaemon, IncompatiblePrimeDaemonError } from "../main/prime-agent/daemon-client"

for (const scenario of [
  { name: "current managed daemon", ownership: "managed", version: VERSION, schema: 26, accepted: true },
  { name: "old managed daemon", ownership: "managed", version: "0.8.1", schema: 22, accepted: false },
  { name: "wrong managed version", ownership: "managed", version: "0.9.2", schema: 26, accepted: false },
  { name: "old external daemon", ownership: "external", version: "0.8.1", schema: 22, accepted: false },
  { name: "compatible external daemon", ownership: "external", version: "0.9.2", schema: 26, accepted: true },
  { name: "external daemon without schema metadata", ownership: "external", version: VERSION, schema: undefined, accepted: false },
  { name: "external daemon with unsupported protocol", ownership: "external", version: VERSION, schema: 26, protocol: 8, accepted: false },
] as const) {
  test(`daemon handshake: ${scenario.name}`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-handshake-"))
    const socketPath = join(directory, "daemon.sock")
    const peers = new Set<Socket>()
    const commands: string[] = []
    const server = createServer((socket) => {
      peers.add(socket)
      socket.on("close", () => peers.delete(socket))
      socket.on("data", (data) => commands.push(data.toString()))
      socket.write(`${JSON.stringify({ type: "daemon_hello", socketPath, protocol: { ...DAEMON_PROTOCOL_INFO, version: "protocol" in scenario ? scenario.protocol : DAEMON_PROTOCOL_INFO.version },
        appVersion: scenario.version, schemaRevision: scenario.schema, serverCapabilities: [] })}\n`)
    })
    t.after(async () => {
      for (const peer of peers) peer.destroy()
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
      await rm(directory, { recursive: true, force: true })
    })
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve) })
    if (scenario.accepted) {
      const client = await connectPrimeDaemon(socketPath, scenario.ownership)
      assert.equal(client.isConnected, true)
      client.close()
    } else {
      await assert.rejects(connectPrimeDaemon(socketPath, scenario.ownership), IncompatiblePrimeDaemonError)
    }
    assert.equal(server.listening, true, "the adapter must leave the existing daemon running")
    assert.deepEqual(commands, [], "handshake validation must not mutate sessions")
  })
}
