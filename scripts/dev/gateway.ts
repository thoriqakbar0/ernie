import http, { type IncomingMessage, type ServerResponse } from "node:http"
import type { Duplex } from "node:stream"
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

export function startDevelopmentGateway(
  host: "127.0.0.1",
  port: number,
  descriptor: RuntimeDescriptor,
): Promise<DevelopmentGateway> {
  const upgradedSockets = new Set<Duplex>()
  const server = http.createServer((request, response) => {
    proxyHttp(request, response, descriptor)
  })
  server.on("upgrade", (request, socket, head) => {
    trackSocket(upgradedSockets, socket)
    proxyUpgrade(request, socket, head, descriptor, upgradedSockets)
  })

  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once("error", onError)
    server.listen(port, host, () => {
      server.off("error", onError)
      const address = server.address()
      if (address === null || typeof address === "string") {
        reject(new Error("Development gateway did not expose a TCP address"))
        return
      }
      resolve({
        url: `http://${host}:${address.port}/?browser=1`,
        close: () => closeGatewayServer(server, upgradedSockets),
      })
    })
  })
}

function proxyHttp(
  request: IncomingMessage,
  response: ServerResponse,
  descriptor: RuntimeDescriptor,
) {
  let target: URL
  try {
    target = resolveGatewayTarget(request.url, descriptor.origin)
  } catch {
    response.writeHead(400)
    response.end("Invalid development gateway target")
    return
  }
  const upstream = http.request(target, {
    method: request.method,
    headers: forwardedHeaders(request.headers, target.host),
  }, (upstreamResponse) => {
    response.writeHead(
      upstreamResponse.statusCode ?? 502,
      forwardedHeaders(upstreamResponse.headers),
    )
    upstreamResponse.pipe(response)
  })
  upstream.on("error", () => {
    if (!response.headersSent) response.writeHead(502)
    response.end("Ernie development runtime is unavailable")
  })
  request.pipe(upstream)
}

function proxyUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  descriptor: RuntimeDescriptor,
  upgradedSockets: Set<Duplex>,
) {
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
    hostname: target.hostname,
    port: target.port,
    path: `${target.pathname}${target.search}`,
    method: request.method,
    headers: { ...request.headers, host: target.host },
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
    if (upstreamHead.length > 0) socket.write(upstreamHead)
    if (head.length > 0) upstreamSocket.write(head)
    upstreamSocket.once("error", () => socket.destroy())
    socket.once("error", () => upstreamSocket.destroy())
    upstreamSocket.pipe(socket).pipe(upstreamSocket)
  })
  upstream.on("error", () => socket.destroy())
  upstream.end()
}

export function resolveGatewayTarget(rawUrl: string | undefined, origin: string) {
  const path = rawUrl ?? "/"
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Development gateway accepts only origin-form request targets")
  }
  return new URL(path, origin)
}

export function isViteHmrUpgrade(protocols: string | string[] | undefined) {
  const values = Array.isArray(protocols) ? protocols : protocols === undefined ? [] : [protocols]
  return values
    .flatMap((value) => value.split(","))
    .some((protocol) => protocol.trim() === "vite-hmr")
}

function trackSocket(sockets: Set<Duplex>, socket: Duplex) {
  sockets.add(socket)
  socket.once("close", () => sockets.delete(socket))
}

function closeGatewayServer(server: http.Server, upgradedSockets: Set<Duplex>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
    for (const socket of upgradedSockets) socket.destroy()
    upgradedSockets.clear()
    server.closeAllConnections()
  })
}

function serializeHeaders(headers: http.IncomingHttpHeaders) {
  return Object.entries(headers)
    .flatMap(([name, value]) => value === undefined
      ? []
      : [`${name}: ${Array.isArray(value) ? value.join(", ") : value}`])
    .join("\r\n")
}

function forwardedHeaders(
  headers: http.IncomingHttpHeaders,
  host?: string,
): http.OutgoingHttpHeaders {
  const entries = host ? Object.entries({ ...headers, host }) : Object.entries(headers)
  return Object.fromEntries(
    entries.filter(([name]) => !HOP_BY_HOP_HEADERS.has(name.toLowerCase())),
  )
}
