import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:net"
import type { Socket } from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { DAEMON_PROTOCOL_INFO, VERSION } from "prime-agent"
import { connectPrimeDaemon, IncompatiblePrimeDaemonError } from "../main/prime-agent/daemon-client"

for (const scenario of [
  {
    accepted: true,
    name: "current managed daemon",
    ownership: "managed",
    schema: 26,
    version: VERSION,
  },
  {
    accepted: false,
    name: "old managed daemon",
    ownership: "managed",
    schema: 22,
    version: "0.8.1",
  },
  {
    accepted: false,
    name: "wrong managed version",
    ownership: "managed",
    schema: 26,
    version: "0.9.2",
  },
  {
    accepted: false,
    name: "old external daemon",
    ownership: "external",
    schema: 22,
    version: "0.8.1",
  },
  {
    accepted: true,
    name: "compatible external daemon",
    ownership: "external",
    schema: 26,
    version: "0.9.2",
  },
  {
    accepted: false,
    name: "external daemon without schema metadata",
    ownership: "external",
    schema: undefined,
    version: VERSION,
  },
  {
    accepted: false,
    name: "external daemon with unsupported protocol",
    ownership: "external",
    protocol: 8,
    schema: 26,
    version: VERSION,
  },
] as const) {
  test(`daemon handshake: ${scenario.name}`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "ernie-handshake-"))
    const socketPath = path.join(directory, "daemon.sock")
    const peers = new Set<Socket>()
    const commands: string[] = []
    const server = createServer((socket) => {
      peers.add(socket)
      socket.on("close", () => peers.delete(socket))
      socket.on("data", (data) => commands.push(data.toString()))
      socket.write(
        `${JSON.stringify({ appVersion: scenario.version, protocol: { ...DAEMON_PROTOCOL_INFO, version: "protocol" in scenario ? scenario.protocol : DAEMON_PROTOCOL_INFO.version }, schemaRevision: scenario.schema, serverCapabilities: [], socketPath, type: "daemon_hello" })}\n`,
      )
    })
    t.after(async () => {
      for (const peer of peers) {
        peer.destroy()
      }
      await promisify(server.close.bind(server))()
      await rm(directory, { force: true, recursive: true })
    })
    server.listen(socketPath)
    await once(server, "listening")
    if (scenario.accepted) {
      const client = await connectPrimeDaemon(socketPath, scenario.ownership)
      assert.equal(client.isConnected, true)
      client.close()
    } else {
      await assert.rejects(
        connectPrimeDaemon(socketPath, scenario.ownership),
        IncompatiblePrimeDaemonError,
      )
    }
    assert.equal(server.listening, true, "the adapter must leave the existing daemon running")
    assert.deepEqual(commands, [], "handshake validation must not mutate sessions")
  })
}
