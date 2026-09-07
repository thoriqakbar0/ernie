import type { PrimeSessionSnapshot } from "../../packages/prime-agent"

type TransportStatus = PrimeSessionSnapshot["transport"]["status"]

export type PrimeAgentCommandAvailability<Connection> =
  | Readonly<{ ok: true; connection: Connection }>
  | Readonly<{ ok: false; error: PrimeAgentTransportUnavailableError }>

class PrimeAgentTransportUnavailableError extends Error {
  readonly _tag = "PrimeAgentTransportUnavailableError"
  readonly sessionId: string
  readonly status: "failed" | "reconnecting"

  constructor(sessionId: string, status: "failed" | "reconnecting") {
    super(`Prime Agent session ${sessionId} is ${status}`)
    this.sessionId = sessionId
    this.status = status
    this.name = "PrimeAgentTransportUnavailableError"
  }
}

export const checkPrimeAgentCommandAvailability = <Connection>(
  input: Readonly<{
    sessionId: string
    recoveryActive: boolean
    transportStatus: TransportStatus
    connection: Connection | undefined
  }>,
): PrimeAgentCommandAvailability<Connection> => {
  if (input.recoveryActive) {
    return {
      error: new PrimeAgentTransportUnavailableError(input.sessionId, "reconnecting"),
      ok: false,
    }
  }
  if (input.transportStatus !== "connected" || !input.connection) {
    return {
      error: new PrimeAgentTransportUnavailableError(
        input.sessionId,
        input.transportStatus === "reconnecting" ? "reconnecting" : "failed",
      ),
      ok: false,
    }
  }
  return { connection: input.connection, ok: true }
}
