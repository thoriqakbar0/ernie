import { createServer, connect, type Server } from "node:net"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { chmod, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { HistoryFailure } from "../../packages/app-history"
import { HistoryController } from "./controller"
import { atomicWrite } from "./source-store"

const Endpoint = Schema.Struct({ version: Schema.Literal(1), socket: Schema.String, token: Schema.String })
const Envelope = Schema.Struct({ token: Schema.String, request: Schema.Unknown })
/** Local socket authentication protects accidental cross-client access; never bind TCP. */
export async function serveHistory(controller: HistoryController, home: string) {
  const socketPath = join(home, "history.sock")
  const token = randomBytes(32).toString("hex")
  await rm(socketPath, { force: true })
  const server = createServer(socket => {
    let buffer = ""
    let handled = false
    socket.setTimeout(15000, () => socket.destroy())
    socket.setEncoding("utf8")
    socket.on("data", chunk => {
      if (handled) return
      buffer += chunk
      if (Buffer.byteLength(buffer) > 65536) { socket.destroy(); return }
      if (!buffer.includes("\n")) return
      handled = true
      void (async () => {
        try {
          const envelope = Schema.decodeUnknownSync(Envelope)(JSON.parse(buffer.slice(0, buffer.indexOf("\n"))))
          const received = Buffer.from(envelope.token)
          const expected = Buffer.from(token)
          if (received.length !== expected.length || !timingSafeEqual(received, expected)) { socket.destroy(); return }
          const result = await Effect.runPromise(controller.request(envelope.request).pipe(Effect.match({
            onSuccess: value => ({ ok: true as const, value }),
            onFailure: error => ({ ok: false as const, error: { code: error.code, message: error.message, nextAction: error.nextAction } }),
          })))
          socket.end(JSON.stringify(result) + "\n")
        } catch { socket.end(JSON.stringify({ ok: false, error: { code: "invalid_request", message: "Invalid history request.", nextAction: "Use protocol version 1." } }) + "\n") }
      })()
    })
    socket.on("error", () => socket.destroy())
  })
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve) })
  await chmod(socketPath, 0o600)
  await atomicWrite(join(home, "endpoint.json"), JSON.stringify({ version: 1, socket: socketPath, token }))
  return async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await rm(join(home, "endpoint.json"), { force: true }); await rm(socketPath, { force: true })
  }
}
/** UI and agent adapters discover the same authenticated local endpoint. */
export async function callHistory(home: string, request: unknown): Promise<unknown> {
  const endpoint = Schema.decodeUnknownSync(Endpoint)(JSON.parse(await readFile(join(home, "endpoint.json"), "utf8")))
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint.socket)
    let response = ""
    socket.setEncoding("utf8")
    socket.setTimeout(120000, () => socket.destroy(new Error("History request timed out")))
    socket.on("connect", () => socket.write(JSON.stringify({ token: endpoint.token, request }) + "\n"))
    socket.on("data", chunk => {
      response += chunk
      if (Buffer.byteLength(response) > 4 * 1024 * 1024) socket.destroy(new Error("History response exceeds limit"))
      if (response.includes("\n")) {
        socket.end()
        try { resolve(JSON.parse(response.slice(0, response.indexOf("\n")))) } catch { reject(new Error("Invalid history response")) }
      }
    })
    socket.on("error", reject)
    socket.on("end", () => { if (!response.includes("\n")) reject(new Error("History connection ended before response")) })
  })
}
