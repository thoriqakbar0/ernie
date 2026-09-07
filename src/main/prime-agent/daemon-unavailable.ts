/** A missing daemon is recoverable without changing the saved Agent action. */
export class PrimeDaemonUnavailableError extends Error {
  constructor() {
    super("Prime Agent is not connected. Use Retry connection in the connection status.")
    this.name = "PrimeDaemonUnavailableError"
  }
}
