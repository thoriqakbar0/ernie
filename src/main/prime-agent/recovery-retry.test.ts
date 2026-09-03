import assert from "node:assert/strict"
import test from "node:test"

import { PrimeAgentRecoveryRetry, runPrimeAgentRecoveryLoop } from "./recovery-retry"

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

test("retries recovery attempts until one succeeds", async () => {
  const results = [false, false, true]
  let attempts = 0
  let waits = 0

  await runPrimeAgentRecoveryLoop({
    attempt: async () => results[attempts++] ?? true,
    shouldStop: () => false,
    wait: async () => {
      waits += 1
    },
  })

  assert.equal(attempts, 3)
  assert.equal(waits, 2)
})

test("does not schedule another retry after disposal during an attempt", async () => {
  const attempt = Promise.withResolvers<boolean>()
  let stopped = false
  let waits = 0

  const loop = runPrimeAgentRecoveryLoop({
    attempt: () => attempt.promise,
    shouldStop: () => stopped,
    wait: async () => {
      waits += 1
    },
  })

  stopped = true
  attempt.resolve(false)
  await loop

  assert.equal(waits, 0)
})
