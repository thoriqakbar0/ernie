import { once } from "node:events"
import http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Duplex } from "node:stream"
import { promisify } from "node:util"
import type { RuntimeDescriptor } from "../../src/dev/runtime-descriptor.ts"

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

export type DevelopmentGateway = Readonly<{
  url: string
  close: () => Promise<void>
}>

const resolveGatewayTarget = (rawUrl: string | undefined, origin: string) => {
  const path = rawUrl ?? "/"
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Development gateway accepts only origin-form request targets")
  }
  return new URL(path, origin)
}

const isViteHmrUpgrade = (protocols: string | string[] | undefined) => {
  if (protocols === undefined) {
    return false
  }
  const values = Array.isArray(protocols) ? protocols : [protocols]
  return values
    .flatMap((value) => value.split(","))
    .some((protocol) => protocol.trim() === "vite-hmr")
}

const trackSocket = (sockets: Set<Duplex>, socket: Duplex) => {
  sockets.add(socket)
  socket.once("close", () => sockets.delete(socket))
}

const closeGatewayServer = async (server: http.Server, upgradedSockets: Set<Duplex>) => {
  const closing = promisify(server.close).call(server)
  for (const socket of upgradedSockets) {
    socket.destroy()
  }
  upgradedSockets.clear()
  server.closeAllConnections()
  await closing
}

const serializeHeaders = (headers: http.IncomingHttpHeaders) =>
  Object.entries(headers)
    .flatMap(([name, value]) =>
      value === undefined ? [] : [`${name}: ${Array.isArray(value) ? value.join(", ") : value}`],
    )
    .join("\r\n")

const forwardedHeaders = (
  headers: http.IncomingHttpHeaders,
  host?: string,
): http.OutgoingHttpHeaders => {
  const entries = host ? Object.entries({ ...headers, host }) : Object.entries(headers)
  return Object.fromEntries(entries.filter(([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase())))
}

const proxyHttp = (
  request: IncomingMessage,
  response: ServerResponse,
  descriptor: RuntimeDescriptor,
) => {
  let target: URL
  try {
    target = resolveGatewayTarget(request.url, descriptor.origin)
  } catch {
    response.writeHead(400)
    response.end("Invalid development gateway target")
    return
  }
  const upstream = http.request(
    target,
    {
      headers: forwardedHeaders(request.headers, target.host),
      method: request.method,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 502,
        forwardedHeaders(upstreamResponse.headers),
      )
      upstreamResponse.pipe(response)
    },
  )
  upstream.on("error", () => {
    if (!response.headersSent) {
      response.writeHead(502)
    }
    response.end("Ernie development runtime is unavailable")
  })
  request.pipe(upstream)
}

const proxyUpgrade = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  descriptor: RuntimeDescriptor,
  upgradedSockets: Set<Duplex>,
) => {
  let target: URL
  try {
    target = resolveGatewayTarget(request.url, descriptor.origin)
  } catch {
    socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
    return
  }
  if (!isViteHmrUpgrade(request.headers["sec-websocket-protocol"])) {
    target.searchParams.set("token", descriptor.authToken)
  }

  const upstream = http.request({
    headers: { ...request.headers, host: target.host },
    hostname: target.hostname,
    method: request.method,
    path: `${target.pathname}${target.search}`,
    port: target.port,
  })
  upstream.on("response", (upstreamResponse) => {
    const headers = serializeHeaders(upstreamResponse.headers)
    socket.write(
      `HTTP/1.1 ${upstreamResponse.statusCode ?? 502} ${upstreamResponse.statusMessage ?? "Bad Gateway"}\r\n${headers}\r\n\r\n`,
    )
    upstreamResponse.pipe(socket)
    upstreamResponse.once("end", () => socket.end())
  })
  socket.once("error", () => upstream.destroy())
  socket.once("close", () => upstream.destroy())
  upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
    trackSocket(upgradedSockets, upstreamSocket)
    const headers = serializeHeaders(upstreamResponse.headers)
    socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n\r\n`)
    if (upstreamHead.length > 0) {
      socket.write(upstreamHead)
    }
    if (head.length > 0) {
      upstreamSocket.write(head)
    }
    upstreamSocket.once("error", () => socket.destroy())
    socket.once("error", () => upstreamSocket.destroy())
    upstreamSocket.pipe(socket).pipe(upstreamSocket)
  })
  upstream.on("error", () => socket.destroy())
  upstream.end()
}

export const startDevelopmentGateway = async (
  host: "127.0.0.1",
  port: number,
  descriptor: RuntimeDescriptor,
): Promise<DevelopmentGateway> => {
  const upgradedSockets = new Set<Duplex>()
  const server = http.createServer((request, response) => {
    proxyHttp(request, response, descriptor)
  })
  server.on("upgrade", (request, socket, head) => {
    trackSocket(upgradedSockets, socket)
    proxyUpgrade(request, socket, head, descriptor, upgradedSockets)
  })

  await once(server.listen(port, host), "listening")
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Development gateway did not expose a TCP address")
  }
  return {
    close: () => closeGatewayServer(server, upgradedSockets),
    url: `http://${host}:${address.port}/?browser=1`,
  }
}
