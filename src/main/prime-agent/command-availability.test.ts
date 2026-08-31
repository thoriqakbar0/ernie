import assert from "node:assert/strict"
import test from "node:test"

import { checkPrimeAgentCommandAvailability } from "./command-availability"

test("returns a typed reconnecting failure while coordinated recovery is active", () => {
  const result = checkPrimeAgentCommandAvailability({
    sessionId: "session-1",
    recoveryActive: true,
    transportStatus: "connected",
    connection: { id: "connection-1" },
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error._tag, "PrimeAgentTransportUnavailableError")
  assert.equal(result.error.sessionId, "session-1")
  assert.equal(result.error.status, "reconnecting")
})

test("returns a typed failure when no live attachment exists", () => {
  const result = checkPrimeAgentCommandAvailability({
    sessionId: "session-1",
    recoveryActive: false,
    transportStatus: "connected",
    connection: undefined,
  })

  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error.status, "failed")
})

test("returns the owning connection only when the attachment is ready", () => {
  const connection = { id: "connection-1" }
  const result = checkPrimeAgentCommandAvailability({
    sessionId: "session-1",
    recoveryActive: false,
    transportStatus: "connected",
    connection,
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.connection, connection)
})
