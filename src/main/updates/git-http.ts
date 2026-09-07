import type { HttpClient } from "isomorphic-git"

async function collectBody(body: Parameters<HttpClient["request"]>[0]["body"]) {
  if (!body) return undefined
  const chunks: Uint8Array[] = []
  for await (const chunk of body) chunks.push(chunk)
  return new Uint8Array(Buffer.concat(chunks)).buffer
}

async function* readBody(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return
  const reader = stream.getReader()
  try {
    let next = await reader.read()
    while (!next.done) { yield next.value; next = await reader.read() }
  } finally { reader.releaseLock() }
}

/** Adapts fetch streaming to Git, with per-request timeout and owning-service cancellation. */
export function createGitHttpClient(signal?: AbortSignal): HttpClient {
  return { request: async (request) => {
    const timeout = AbortSignal.timeout(30_000)
    const response = await fetch(request.url, {
      method: request.method, headers: request.headers, body: await collectBody(request.body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    return { url: response.url, statusCode: response.status, statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers), body: readBody(response.body) }
  } }
}
