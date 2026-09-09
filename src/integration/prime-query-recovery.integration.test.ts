import assert from "node:assert/strict"
import test from "node:test"
import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { createPrimeQueryRecovery } from "../renderer/prime-query-recovery"

test("recovery refreshes failed native reads while preserving accepted settings and session data", async (t) => {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  t.after(() => cache.clear())
  const depthKey = ["prime-agent", "recurrent-depth", "parent"]
  const modelKey = ["prime-agent", "models", "parent", false]
  const sessionKey = ["prime-agent", "session", "parent"]
  const session = {
    children: ["child"],
    draft: "keep this draft",
    id: "parent",
    thinkingLevel: "high",
  }
  cache.setQueryData(depthKey, 1)
  cache.setQueryData(sessionKey, session)
  let connected = false
  let depthReads = 0
  let modelReads = 0
  const depth = new QueryObserver(cache, {
    queryFn: () => {
      depthReads += 1
      return connected ? Promise.resolve(1) : Promise.reject(new Error("fixture offline"))
    },
    queryKey: depthKey,
  })
  const models = new QueryObserver(cache, {
    queryFn: () => {
      modelReads += 1
      return connected ? Promise.resolve(["Luna"]) : Promise.reject(new Error("fixture offline"))
    },
    queryKey: modelKey,
  })
  t.after(depth.subscribe(() => {}))
  t.after(models.subscribe(() => {}))
  await depth.refetch()
  await models.refetch()
  assert.equal(cache.getQueryState(depthKey)?.status, "error")
  assert.equal(cache.getQueryData(depthKey), 1)
  const recover = createPrimeQueryRecovery(cache, 0)
  const before = { depthReads, modelReads }
  await recover(0)
  assert.deepEqual({ depthReads, modelReads }, before)
  connected = true
  const refreshing = recover(1)
  assert.equal(cache.getQueryData(depthKey), 1)
  await refreshing
  assert.equal(cache.getQueryState(depthKey)?.status, "success")
  assert.equal(cache.getQueryState(modelKey)?.status, "success")
  assert.equal(cache.getQueryData(depthKey), 1)
  assert.deepEqual(cache.getQueryData(modelKey), ["Luna"])
  assert.equal(cache.getQueryData(sessionKey), session)
  assert.equal(cache.getQueryState(sessionKey)?.isInvalidated, false)
  assert.equal(depthReads, before.depthReads + 1)
  assert.equal(modelReads, before.modelReads + 1)
  const reads = { depthReads, modelReads }
  await recover(1)
  await recover(0)
  assert.deepEqual({ depthReads, modelReads }, reads)
  assert.ok(depthReads >= 2)
  assert.ok(modelReads >= 2)
})
