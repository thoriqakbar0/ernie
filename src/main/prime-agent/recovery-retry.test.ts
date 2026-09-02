import assert from "node:assert/strict"
import test from "node:test"

import { PrimeAgentRecoveryRetry } from "./recovery-retry"

test("shares one recovery delay and settles it on completion or disposal", async () => {
  const scheduled: Array<() => void> = []
  let cancellations = 0
  const retry = new PrimeAgentRecoveryRetry((callback) => {
    scheduled.push(callback)
    return () => {
      cancellations += 1
    }
  })

  const first = retry.wait()
  const duplicate = retry.wait()
  assert.equal(first, duplicate)
  assert.equal(retry.pending, true)
  assert.equal(scheduled.length, 1)

  scheduled.shift()?.()
  await first
  assert.equal(retry.pending, false)

  const disposed = retry.wait()
  assert.equal(scheduled.length, 1)
  retry.clear()
  await disposed
  assert.equal(retry.pending, false)
  assert.equal(cancellations, 1)
})
