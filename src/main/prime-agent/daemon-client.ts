import { homedir } from "node:os"
import { join } from "node:path"
import { DAEMON_PROTOCOL_NAME, DAEMON_PROTOCOL_VERSION, DaemonClient, VERSION } from "prime-agent"

export class IncompatiblePrimeDaemonError extends Error {
  readonly _tag = "IncompatiblePrimeDaemonError"
}

/** Version the managed endpoint without terminating a daemon that another checkout owns. */
export const managedDaemonSocketName = `prime-agent-v${VERSION}.sock`

/** Shared managed endpoint used by the launcher and service fallback. */
export function managedDaemonSocketPath() {
  return process.platform === "win32"
    ? `\\\\.\\pipe\\ernie-prime-agent-v${VERSION}`
    : join(homedir(), "Library", "Application Support", "Ernie", managedDaemonSocketName)
}

/** Validate the handshake before a client can issue session commands. */
export async function connectPrimeDaemon(socketPath: string, ownership: "managed" | "external") {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect(500)
    const hello = await client.waitForHello(1_000)
    if (hello.protocol.name !== DAEMON_PROTOCOL_NAME || hello.protocol.version !== DAEMON_PROTOCOL_VERSION ||
        (hello.schemaRevision ?? 0) < 26 || (ownership === "managed" && hello.appVersion !== VERSION)) {
      throw new IncompatiblePrimeDaemonError(
        `Prime Agent at ${socketPath} is incompatible (version ${hello.appVersion ?? "unknown"}, schema ${hello.schemaRevision ?? "unknown"}). ` +
        `Use Prime Agent ${VERSION} with protocol ${DAEMON_PROTOCOL_VERSION} and schema 26 or newer. The existing daemon was left running.`,
      )
    }
    return client
  } catch (error) {
    client.close()
    throw error
  }
}
