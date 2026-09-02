import assert from "node:assert/strict"
import test from "node:test"

import type { PrimeSessionSnapshot } from "../../packages/prime-agent"
import { createPrimeUsefulSessionFixture } from "../../packages/prime-agent/fixtures"
import { enrichPrimeSessionSnapshot } from "./snapshot"

const session = {
  id: "session-1",
  cwd: "/workspace/ernie",
  lifecycle: "live" as const,
  state: "idle" as const,
}

const previous: PrimeSessionSnapshot = {
  session,
  messages: [],
  useful: {
    ...createPrimeUsefulSessionFixture(session),
    parent: { sessionId: "parent-1" },
    sessionTree: { tree: [{ id: "old" }], leafId: "old" },
    replay: { status: "complete", toSequence: 4 },
  },
  transport: { status: "connected" },
}

test("preserves metadata omitted by an ordinary Prime Agent refresh", () => {
  assert.deepEqual(
    enrichPrimeSessionSnapshot({ snapshot: { state: {}, messages: [] }, previous }),
    {
      state: {},
      messages: [],
      parent: previous.useful.parent,
      replay: previous.useful.replay,
    },
  )
})

test("prefers metadata supplied by the current connection", () => {
  assert.deepEqual(
    enrichPrimeSessionSnapshot({
      snapshot: {
        state: {},
        messages: [],
        parent: { sessionId: "current-parent" },
        replay: { status: "partial", toSequence: 5 },
      },
      previous,
    }),
    {
      state: {},
      messages: [],
      parent: { sessionId: "current-parent" },
      replay: { status: "partial", toSequence: 5 },
    },
  )
})

test("keeps explicit invalid metadata for the strict projector to reject", () => {
  assert.deepEqual(
    enrichPrimeSessionSnapshot({
      snapshot: { state: {}, messages: [], parent: null, replay: null },
      previous,
    }),
    { state: {}, messages: [], parent: null, replay: null },
  )
})
