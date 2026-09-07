import type { HttpClient } from "isomorphic-git"

const collectBody = async (body: Parameters<HttpClient["request"]>[0]["body"]) => {
  if (!body) {
    return
  }
  const chunks: Uint8Array[] = []
  for await (const chunk of body) {
    chunks.push(chunk)
  }
  return new Uint8Array(Buffer.concat(chunks)).buffer
}

const readBody = async function* readBody(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) {
    return
  }
  const reader = stream.getReader()
  try {
    const chunks = {
      [Symbol.asyncIterator]: () => ({ next: () => reader.read() }),
    }
    for await (const chunk of chunks) {
      yield chunk
    }
  } finally {
    reader.releaseLock()
  }
}

/** Adapts fetch streaming to Git, with per-request timeout and owning-service cancellation. */
export const createGitHttpClient = function createGitHttpClient(signal?: AbortSignal): HttpClient {
  return {
    request: async (request) => {
      const timeout = AbortSignal.timeout(30_000)
      const response = await fetch(request.url, {
        body: await collectBody(request.body),
        headers: request.headers,
        method: request.method,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      })
      return {
        body: readBody(response.body),
        headers: Object.fromEntries(response.headers),
        statusCode: response.status,
        statusMessage: response.statusText,
        url: response.url,
      }
    },
  }
}
