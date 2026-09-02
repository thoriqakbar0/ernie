import assert from "node:assert/strict"
import test from "node:test"
import http from "node:http"
import { connect } from "node:net"
import type { Duplex } from "node:stream"

import {
  isViteHmrUpgrade,
  resolveGatewayTarget,
  startDevelopmentGateway,
} from "../../scripts/dev/gateway.ts"

test("gateway targets stay pinned to the Zenbu origin", () => {
  assert.equal(
    resolveGatewayTarget("/index.html?browser=1", "http://127.0.0.1:5000").href,
    "http://127.0.0.1:5000/index.html?browser=1",
  )
  assert.throws(() => resolveGatewayTarget("http://example.com/", "http://127.0.0.1:5000"))
  assert.throws(() => resolveGatewayTarget("//example.com/", "http://127.0.0.1:5000"))
})

test("only the Vite HMR protocol bypasses Zenbu authentication", () => {
  assert.equal(isViteHmrUpgrade("vite-hmr"), true)
  assert.equal(isViteHmrUpgrade("other, vite-hmr"), true)
  assert.equal(isViteHmrUpgrade("not-vite-hmr"), false)
  assert.equal(isViteHmrUpgrade("vite-hmr-evil"), false)
  assert.equal(isViteHmrUpgrade(undefined), false)
})

test("rejected WebSocket upgrades close without disclosing the injected token", async () => {
  let upstreamUrl = ""
  const upstream = http.createServer((request, response) => {
    upstreamUrl = request.url ?? ""
    response.writeHead(401, { "content-type": "text/plain" })
    response.end("denied")
  })
  await listen(upstream)
  const address = upstream.address()
  if (address === null || typeof address === "string") throw new Error("Upstream did not expose a port")

  const gateway = await startDevelopmentGateway("127.0.0.1", 0, {
    version: 1,
    generation: "test",
    ownerPid: process.pid,
    origin: `http://127.0.0.1:${address.port}`,
    authToken: "private-token",
  })

  try {
    const gatewayPort = Number(new URL(gateway.url).port)
    const response = await rawUpgrade(gatewayPort)
    assert.match(response, /401 Unauthorized/)
    assert.doesNotMatch(response, /private-token/)
    assert.match(upstreamUrl, /token=private-token/)
  } finally {
    await gateway.close()
    await close(upstream)
  }
})

function listen(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
}

function close(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
}

function rawUpgrade(port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = connect(port, "127.0.0.1")
    let response = ""
    socket.setEncoding("utf8")
    socket.once("error", reject)
    socket.on("data", (chunk) => { response += chunk })
    socket.once("close", () => resolve(response))
    socket.once("connect", () => {
      socket.write(
        "GET /rpc HTTP/1.1\r\n"
        + "Host: 127.0.0.1\r\n"
        + "Connection: Upgrade\r\n"
        + "Upgrade: websocket\r\n\r\n",
      )
    })
  })
}

test("gateway shutdown destroys upgraded WebSocket pairs", { timeout: 2_000 }, async () => {
  let upstreamSocket: Duplex | undefined
  const upstream = http.createServer()
  upstream.on("upgrade", (_request, socket) => {
    upstreamSocket = socket
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n"
      + "Connection: Upgrade\r\n"
      + "Upgrade: websocket\r\n\r\n",
    )
  })
  await listen(upstream)
  const address = upstream.address()
  if (address === null || typeof address === "string") throw new Error("Upstream did not expose a port")
  const gateway = await startDevelopmentGateway("127.0.0.1", 0, {
    version: 1,
    generation: "shutdown-test",
    ownerPid: process.pid,
    origin: `http://127.0.0.1:${address.port}`,
    authToken: "private-token",
  })
  const client = connect(Number(new URL(gateway.url).port), "127.0.0.1")

  try {
    client.setEncoding("utf8")
    const upgraded = new Promise<void>((resolve, reject) => {
      client.once("error", reject)
      client.on("data", (chunk) => {
        if (chunk.includes("101 Switching Protocols")) resolve()
      })
    })
    client.once("connect", () => {
      client.write(
        "GET /hmr HTTP/1.1\r\n"
        + "Host: 127.0.0.1\r\n"
        + "Connection: Upgrade\r\n"
        + "Upgrade: websocket\r\n"
        + "Sec-WebSocket-Protocol: vite-hmr\r\n\r\n",
      )
    })
    await upgraded
    const closed = new Promise<void>((resolve) => client.once("close", resolve))
    await Promise.race([
      Promise.all([gateway.close(), closed]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Gateway shutdown timed out")), 1_000)),
    ])
  } finally {
    client.destroy()
    upstreamSocket?.destroy()
    await close(upstream)
  }
})
