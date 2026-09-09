import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { Option, Schema } from "effect"
import { DAEMON_PROTOCOL_NAME, DAEMON_PROTOCOL_VERSION, DaemonClient, VERSION } from "prime-agent"

/** A rejected greeting never grants access to session commands. */
export class IncompatiblePrimeDaemonError extends Error {
  override name = "IncompatiblePrimeDaemonError"
  readonly _tag = "IncompatiblePrimeDaemonError"
}

/** Version the managed endpoint without terminating a daemon that another checkout owns. */
export const managedDaemonSocketName = `prime-agent-v${VERSION}.sock`

/** Shared managed endpoint used by the launcher and service fallback. */
export const managedDaemonSocketPath = () =>
  process.platform === "win32"
    ? `\\\\.\\pipe\\ernie-prime-agent-v${VERSION}`
    : path.join(homedir(), "Library", "Application Support", "Ernie", managedDaemonSocketName)

/** Validate the handshake before a client can issue session commands. */
export const connectPrimeDaemon = async (socketPath: string, ownership: "managed" | "external") => {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect(500)
    const parsed = Schema.decodeUnknownOption(
      Schema.Struct({
        appVersion: Schema.optionalKey(Schema.String),
        protocol: Schema.Struct({ name: Schema.String, version: Schema.Natural }),
        schemaRevision: Schema.Natural,
      }),
    )(await client.waitForHello(1000))
    if (
      Option.isNone(parsed) ||
      parsed.value.protocol.name !== DAEMON_PROTOCOL_NAME ||
      parsed.value.protocol.version !== DAEMON_PROTOCOL_VERSION ||
      parsed.value.schemaRevision < 26 ||
      (ownership === "managed" && parsed.value.appVersion !== VERSION)
    ) {
      throw new IncompatiblePrimeDaemonError(
        `Prime Agent is incompatible. Use protocol ${DAEMON_PROTOCOL_VERSION} and schema 26 or newer ` +
          `(client package ${VERSION}). Check or update your daemon yourself, then retry.`,
      )
    }
    if (!client.isConnected) {
      throw new Error("Prime Agent closed during its handshake")
    }
    return client
  } catch (error) {
    client.close()
    throw error
  }
}

/** Locate the existing user daemon using Prime Agent's default socket convention. */
export const existingDaemonSocketPath = () =>
  process.platform === "win32"
    ? "\\\\.\\pipe\\prime-agent-daemon"
    : path.join(
        tmpdir(),
        `prime-agent-${typeof process.getuid === "function" ? process.getuid() : "user"}`,
        "daemon.sock",
      )
