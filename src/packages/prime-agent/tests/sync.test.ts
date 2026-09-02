import assert from "node:assert/strict"
import test from "node:test"

import type {
  PrimeSessionChange,
  PrimeSessionChangeEnvelope,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
} from "../index"
import {
  createPrimeSessionSyncState,
  getPrimeSessionSnapshotEnvelope,
  parsePrimeSessionChangeEnvelope,
  parsePrimeSessionSnapshotEnvelope,
  PRIME_SESSION_CHANGE_BUFFER_LIMIT,
  reducePrimeSessionChange,
  reducePrimeSessionSnapshot,
} from "../sync"
import { createPrimeUsefulSessionFixture } from "../fixtures"

const baseSession = {
  id: "session-1",
  cwd: "/workspace/ernie",
  name: "Ernie",
  lifecycle: "live" as const,
  state: "idle" as const,
}
const baseMessages = [{ id: "message-1", role: "user" as const, content: "hello" }]

const baseSnapshot: PrimeSessionSnapshot = {
  session: baseSession,
  messages: baseMessages,
  useful: createPrimeUsefulSessionFixture(baseSession, baseMessages),
  transport: { status: "connected" },
}

function snapshotEnvelope(
  revision: number,
  generation = "generation-1",
  snapshot = baseSnapshot,
): PrimeSessionSnapshotEnvelope {
  return {
    sessionId: "session-1",
    generation,
    revision,
    snapshot,
  }
}

function changeEnvelope(
  revision: number,
  change: PrimeSessionChange,
  generation = "generation-1",
): PrimeSessionChangeEnvelope {
  return {
    sessionId: "session-1",
    generation,
    revision,
    change,
  }
}

test("parses JSON-safe snapshot and change envelopes", () => {
  const snapshot = snapshotEnvelope(2)
  const change = changeEnvelope(3, {
    type: "transport",
    transport: { status: "reconnecting", error: "socket closed" },
  })

  assert.deepEqual(parsePrimeSessionSnapshotEnvelope(snapshot), {
    ok: true,
    value: snapshot,
  })
  assert.deepEqual(parsePrimeSessionChangeEnvelope(change), {
    ok: true,
    value: change,
  })
})

test("rejects malformed payloads and mismatched session identities", () => {
  const malformed = parsePrimeSessionSnapshotEnvelope({
    ...snapshotEnvelope(0),
    revision: -1,
  })
  const mismatched = parsePrimeSessionChangeEnvelope({
    ...changeEnvelope(1, { type: "session", session: baseSnapshot.session }),
    sessionId: "another-session",
  })
  const duplicateMessages = parsePrimeSessionSnapshotEnvelope({
    ...snapshotEnvelope(0),
    snapshot: {
      ...baseSnapshot,
      messages: [baseSnapshot.messages[0], baseSnapshot.messages[0]],
    },
  })
  const excessProperty = parsePrimeSessionChangeEnvelope({
    ...changeEnvelope(1, { type: "transport", transport: { status: "connected" } }),
    unexpected: true,
  })

  assert.equal(malformed.ok, false)
  assert.equal(malformed.error._tag, "PrimeSessionProtocolError")
  assert.equal(mismatched.ok, false)
  assert.equal(mismatched.error._tag, "PrimeSessionProtocolError")
  assert.equal(duplicateMessages.ok, false)
  assert.equal(duplicateMessages.error._tag, "PrimeSessionProtocolError")
  assert.equal(excessProperty.ok, false)
  assert.equal(excessProperty.error._tag, "PrimeSessionProtocolError")
})

test("rejects non-finite numbers at the JSON boundary", () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = parsePrimeSessionSnapshotEnvelope({
      ...snapshotEnvelope(0),
      snapshot: {
        ...baseSnapshot,
        useful: {
          ...baseSnapshot.useful,
          state: {
            ...baseSnapshot.useful.state,
            contextUsage: { value },
          },
        },
      },
    })

    assert.equal(result.ok, false)
  }
})

test("buffers an early change and applies it after the attachment snapshot", () => {
  let state = createPrimeSessionSyncState("session-1")
  state = reducePrimeSessionChange(state, changeEnvelope(2, {
    type: "message",
    message: { id: "message-2", role: "assistant", content: "streaming" },
  }))
  state = reducePrimeSessionSnapshot(state, snapshotEnvelope(1))

  assert.equal(state.status, "ready")
  assert.equal(getPrimeSessionSnapshotEnvelope(state)?.revision, 2)
  assert.equal(
    getPrimeSessionSnapshotEnvelope(state)?.snapshot.messages.at(-1)?.content,
    "streaming",
  )
})

test("ignores duplicate and stale changes without regressing state", () => {
  let state = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(3),
  )
  state = reducePrimeSessionChange(state, changeEnvelope(3, {
    type: "session",
    session: { ...baseSnapshot.session, state: "working" },
  }))
  state = reducePrimeSessionChange(state, changeEnvelope(2, {
    type: "session",
    session: { ...baseSnapshot.session, state: "recovering" },
  }))

  assert.equal(state.status, "ready")
  assert.equal(getPrimeSessionSnapshotEnvelope(state)?.revision, 3)
  assert.equal(getPrimeSessionSnapshotEnvelope(state)?.snapshot.session.state, "idle")
})

test("upserts streaming messages at the next revision", () => {
  const streaming = { id: "message-2", role: "assistant" as const, content: "hel" }
  let state = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(0, "generation-1", { ...baseSnapshot, messages: [] }),
  )
  state = reducePrimeSessionChange(state, changeEnvelope(1, {
    type: "message",
    message: streaming,
  }))
  state = reducePrimeSessionChange(state, changeEnvelope(2, {
    type: "message",
    message: { ...streaming, content: "hello" },
  }))

  assert.equal(state.status, "ready")
  assert.deepEqual(getPrimeSessionSnapshotEnvelope(state)?.snapshot.messages, [
    { ...streaming, content: "hello" },
  ])
})

test("requests recovery for revision gaps and generation changes", () => {
  const ready = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(4),
  )
  const gap = reducePrimeSessionChange(ready, changeEnvelope(6, {
    type: "transport",
    transport: { status: "reconnecting" },
  }))
  const generation = reducePrimeSessionChange(ready, changeEnvelope(5, {
    type: "transport",
    transport: { status: "connected" },
  }, "generation-2"))

  assert.equal(gap.status, "recovering")
  assert.equal(gap.status === "recovering" ? gap.reason : undefined, "revision-gap")
  assert.equal(generation.status, "recovering")
  assert.equal(
    generation.status === "recovering" ? generation.reason : undefined,
    "generation-changed",
  )
})

test("uses a covering recovery snapshot as the new source of truth", () => {
  const ready = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(1),
  )
  const recovering = reducePrimeSessionChange(ready, changeEnvelope(3, {
    type: "messages",
    messages: [{ id: "message-3", role: "system", content: "recovered" }],
  }))
  const replacement = snapshotEnvelope(3, "generation-1", {
    ...baseSnapshot,
    messages: [{ id: "message-3", role: "system", content: "recovered" }],
  })
  const restored = reducePrimeSessionSnapshot(recovering, replacement)

  assert.equal(restored.status, "ready")
  assert.equal(getPrimeSessionSnapshotEnvelope(restored), replacement)
})

test("a replacement generation discards buffered changes from the old daemon", () => {
  const ready = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(2),
  )
  const recovering = reducePrimeSessionChange(ready, changeEnvelope(4, {
    type: "transport",
    transport: { status: "reconnecting" },
  }))
  const replacement = snapshotEnvelope(0, "generation-2", {
    ...baseSnapshot,
    transport: { status: "connected" },
  })

  const restored = reducePrimeSessionSnapshot(recovering, replacement)

  assert.equal(restored.status, "ready")
  assert.equal(getPrimeSessionSnapshotEnvelope(restored), replacement)
})

test("a replacement snapshot applies buffered changes from its own generation", () => {
  const ready = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState("session-1"),
    snapshotEnvelope(2),
  )
  const recovering = reducePrimeSessionChange(ready, changeEnvelope(1, {
    type: "transport",
    transport: { status: "reconnecting" },
  }, "generation-2"))
  const replacement = snapshotEnvelope(0, "generation-2")

  const restored = reducePrimeSessionSnapshot(recovering, replacement)

  assert.equal(restored.status, "ready")
  assert.equal(getPrimeSessionSnapshotEnvelope(restored)?.revision, 1)
  assert.deepEqual(getPrimeSessionSnapshotEnvelope(restored)?.snapshot.transport, {
    status: "reconnecting",
  })
})

test("overflow remains recovering until a snapshot covers the newest observed revision", () => {
  let state = createPrimeSessionSyncState("session-1")
  for (let revision = 1; revision <= PRIME_SESSION_CHANGE_BUFFER_LIMIT + 2; revision += 1) {
    state = reducePrimeSessionChange(state, changeEnvelope(revision, {
      type: "transport",
      transport: { status: "reconnecting" },
    }))
  }

  assert.equal(state.status, "recovering")
  assert.equal(state.status === "recovering" ? state.reason : undefined, "buffer-overflow")

  state = reducePrimeSessionSnapshot(state, snapshotEnvelope(PRIME_SESSION_CHANGE_BUFFER_LIMIT))
  assert.equal(state.status, "recovering")

  state = reducePrimeSessionSnapshot(state, snapshotEnvelope(PRIME_SESSION_CHANGE_BUFFER_LIMIT + 2))
  assert.equal(state.status, "ready")
})
