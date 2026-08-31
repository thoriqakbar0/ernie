import type { PrimeSessionSnapshot } from "../../packages/prime-agent"

type TransportStatus = PrimeSessionSnapshot["transport"]["status"]

export type PrimeAgentCommandAvailability<Connection> =
  | Readonly<{ ok: true; connection: Connection }>
  | Readonly<{ ok: false; error: PrimeAgentTransportUnavailableError }>

export class PrimeAgentTransportUnavailableError extends Error {
  readonly _tag = "PrimeAgentTransportUnavailableError"

  constructor(
    readonly sessionId: string,
    readonly status: "failed" | "reconnecting",
  ) {
    super(`Prime Agent session ${sessionId} is ${status}`)
    this.name = "PrimeAgentTransportUnavailableError"
  }
}

export function checkPrimeAgentCommandAvailability<Connection>(input: Readonly<{
  sessionId: string
  recoveryActive: boolean
  transportStatus: TransportStatus
  connection: Connection | undefined
}>): PrimeAgentCommandAvailability<Connection> {
  if (input.recoveryActive) {
    return {
      ok: false,
      error: new PrimeAgentTransportUnavailableError(input.sessionId, "reconnecting"),
    }
  }
  if (input.transportStatus !== "connected" || !input.connection) {
    return {
      ok: false,
      error: new PrimeAgentTransportUnavailableError(
        input.sessionId,
        input.transportStatus === "reconnecting" ? "reconnecting" : "failed",
      ),
    }
  }
  return { ok: true, connection: input.connection }
}
