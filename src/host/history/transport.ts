import { createServer, connect } from "node:net"
import { once } from "node:events"
import { promisify } from "node:util"
import { randomBytes, timingSafeEqual } from "node:crypto"
import { chmod, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import type { HistoryController } from "./controller"
import { atomicWrite } from "./source-store"

const Endpoint = Schema.Struct({
  socket: Schema.String,
  token: Schema.String,
  version: Schema.Literal(1),
})
const Envelope = Schema.Struct({ request: Schema.Unknown, token: Schema.String })
/** Local socket authentication protects accidental cross-client access; never bind TCP. */
export const serveHistory = async (controller: HistoryController, home: string) => {
  const socketPath = path.join(home, "history.sock")
  const token = randomBytes(32).toString("hex")
  await rm(socketPath, { force: true })
  const server = createServer((socket) => {
    let buffer = ""
    let handled = false
    socket.setTimeout(15_000, () => socket.destroy())
    socket.setEncoding("utf-8")
    socket.on("data", (chunk) => {
      if (handled) {
        return
      }
      buffer += chunk
      if (Buffer.byteLength(buffer) > 65_536) {
        socket.destroy()
        return
      }
      if (!buffer.includes("\n")) {
        return
      }
      handled = true
      void (async () => {
        try {
          const envelope = Schema.decodeUnknownSync(Envelope)(
            JSON.parse(buffer.slice(0, buffer.indexOf("\n"))),
          )
          const received = Buffer.from(envelope.token)
          const expected = Buffer.from(token)
          if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
            socket.destroy()
            return
          }
          const result = await Effect.runPromise(
            controller.request(envelope.request).pipe(
              Effect.match({
                onFailure: (error) => ({
                  error: { code: error.code, message: error.message, nextAction: error.nextAction },
                  ok: false as const,
                }),
                onSuccess: (value) => ({ ok: true as const, value }),
              }),
            ),
          )
          socket.end(`${JSON.stringify(result)}\n`)
        } catch {
          socket.end(
            `${JSON.stringify({ error: { code: "invalid_request", message: "Invalid history request.", nextAction: "Use protocol version 1." }, ok: false })}\n`,
          )
        }
      })()
    })
    socket.on("error", () => socket.destroy())
  })
  const listening = once(server, "listening")
  server.listen(socketPath)
  await listening
  await chmod(socketPath, 0o600)
  await atomicWrite(
    path.join(home, "endpoint.json"),
    JSON.stringify({ socket: socketPath, token, version: 1 }),
  )
  return async () => {
    await promisify(server.close.bind(server))()
    await rm(path.join(home, "endpoint.json"), { force: true })
    await rm(socketPath, { force: true })
  }
}
/** UI and agent adapters discover the same authenticated local endpoint. */
export const callHistory = async (home: string, request: unknown): Promise<unknown> => {
  const endpoint = Schema.decodeUnknownSync(Endpoint)(
    JSON.parse(await readFile(path.join(home, "endpoint.json"), "utf-8")),
  )
  const socket = connect(endpoint.socket)
  let response = ""
  socket.setEncoding("utf-8")
  socket.setTimeout(120_000, () => socket.destroy(new Error("History request timed out")))
  socket.on("connect", () =>
    socket.write(`${JSON.stringify({ request, token: endpoint.token })}\n`),
  )
  for await (const chunk of socket.iterator({ destroyOnReturn: false })) {
    response += chunk
    if (Buffer.byteLength(response) > 4 * 1024 * 1024) {
      socket.destroy(new Error("History response exceeds limit"))
    }
    if (response.includes("\n")) {
      socket.end()
      try {
        return JSON.parse(response.slice(0, response.indexOf("\n")))
      } catch {
        throw new Error("Invalid history response")
      }
    }
  }
  throw new Error("History connection ended before response")
}
