import assert from "node:assert/strict"
import test from "node:test"

import { projectCurrentPrimeSessionRefresh } from "./refresh"

test("discards a refresh that resolves after its attachment generation changes", async () => {
  const snapshot = Promise.withResolvers<unknown>()
  let current = true
  const refresh = projectCurrentPrimeSessionRefresh({
    readSnapshot: () => snapshot.promise,
    previousSession: {
      id: "session-1",
      cwd: "/workspace/ernie",
      lifecycle: "live",
      state: "idle",
    },
    isCurrent: () => current,
  })

  current = false
  snapshot.resolve({ invalid: "stale snapshot must not be projected" })

  assert.equal(await refresh, undefined)
})
