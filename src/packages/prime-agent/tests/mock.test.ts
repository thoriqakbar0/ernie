import assert from "node:assert/strict"
import test from "node:test"

import { createMockPrimeAgentClient } from "../../../dev-only/prime-agent/mock"
import { createPrimeWorkspace } from "../../prime-workspace"
import type { PrimeSessionSyncEvent } from "../index"
import { createPrimeUsefulSessionFixture } from "../fixtures"
import {
  createPrimeSessionSyncState,
  getPrimeSessionSnapshotEnvelope,
  reducePrimeSessionChange,
  reducePrimeSessionSnapshot,
} from "../sync"

test("authoritative seeds define the mock session list and transport", async () => {
  const session = {
    id: "seeded-session",
    cwd: "/workspace/seeded",
    name: "Seeded session",
    lifecycle: "live" as const,
    state: "recovering" as const,
  }
  const messages = [{ id: "seeded-message", role: "assistant" as const, content: "Still here" }]
  const useful = createPrimeUsefulSessionFixture(session, messages)
  const client = createMockPrimeAgentClient({
    initialSnapshots: [{
      session,
      messages,
      useful,
      transport: { status: "failed", error: "Seeded failure" },
    }],
  })

  assert.deepEqual(await client.listSessions(), [session])
  assert.deepEqual(
    (await client.attachSession({ sessionId: "seeded-session" })).snapshot,
    {
      session,
      messages,
      useful,
      transport: { status: "failed", error: "Seeded failure" },
    },
  )
  client.dispose()
})

test("an explicit empty seed creates an empty mock", async () => {
  const client = createMockPrimeAgentClient({ initialSnapshots: [] })
  assert.deepEqual(await client.listSessions(), [])
  client.dispose()
})

test("creating a session preserves every existing session", async () => {
  const client = createMockPrimeAgentClient()

  const created = await client.createSession({
    cwd: "/workspace/two",
    name: "Second session",
  })

  assert.deepEqual(
    (await client.listSessions()).map(({ id }) => id),
    ["mock-session-1", created.id],
  )
  assert.equal((await client.attachSession({ sessionId: created.id })).snapshot.session.id, created.id)
  client.dispose()
})

test("work and transcripts stay isolated to their owning session", async () => {
  const client = createMockPrimeAgentClient()
  const created = await client.createSession({ cwd: "/workspace/two" })

  await client.prompt({
    sessionId: "mock-session-1",
    admissionId: "admission-1",
    commandId: "command-1",
    content: "change only the first session",
  })

  const first = await client.attachSession({ sessionId: "mock-session-1" })
  const second = await client.attachSession({ sessionId: created.id })
  assert.equal(first.snapshot.session.state, "working")
  assert.equal(first.snapshot.messages.at(-1)?.content, "change only the first session")
  assert.equal(second.snapshot.session.state, "idle")
  assert.deepEqual(second.snapshot.messages, [])

  await client.abort({ sessionId: "mock-session-1" })
  client.dispose()
})

test("session event listeners receive only their session events", async () => {
  const client = createMockPrimeAgentClient()
  const created = await client.createSession({ cwd: "/workspace/two" })
  const firstEvents: string[] = []
  const secondEvents: string[] = []
  const unsubscribeFirst = client.subscribeSession("mock-session-1", (event) => {
    firstEvents.push(event.type === "change" ? event.envelope.change.type : event.type)
  })
  const unsubscribeSecond = client.subscribeSession(created.id, (event) => {
    secondEvents.push(event.type === "change" ? event.envelope.change.type : event.type)
  })

  await client.prompt({
    sessionId: created.id,
    admissionId: "admission-2",
    commandId: "command-2",
    content: "second only",
  })

  assert.deepEqual(firstEvents, [])
  assert.deepEqual(secondEvents, [
    "session",
    "usefulState",
    "session",
    "message",
    "structured",
    "usefulState",
  ])
  unsubscribeFirst()
  unsubscribeSecond()
  await client.abort({ sessionId: created.id })
  client.dispose()
})

test("mock changes keep legacy and useful session state synchronized", async () => {
  const client = createMockPrimeAgentClient({ initialSnapshots: [] })
  const session = await client.createSession({ cwd: "/workspace/new" })
  const initial = await client.attachSession({ sessionId: session.id })
  const changes: PrimeSessionSyncEvent[] = []
  const unsubscribe = client.subscribeSession(session.id, (event) => changes.push(event))

  const requestContent = "keep useful state synchronized"
  await client.prompt({
    sessionId: session.id,
    admissionId: "admission-useful",
    commandId: "command-useful",
    content: requestContent,
  })

  let state = reducePrimeSessionSnapshot(
    createPrimeSessionSyncState(session.id),
    initial,
  )
  for (const event of changes) {
    if (event.type === "change") state = reducePrimeSessionChange(state, event.envelope)
  }
  const reduced = getPrimeSessionSnapshotEnvelope(state)
  const fresh = await client.attachSession({ sessionId: session.id })

  assert.deepEqual(reduced?.snapshot, fresh.snapshot)
  assert.equal(reduced?.snapshot.useful.state.messageCount, 1)
  assert.equal(reduced?.snapshot.useful.state.isStreaming, true)
  assert.equal(reduced?.snapshot.useful.structuredMessages[0]?.content, requestContent)

  unsubscribe()
  await client.abort({ sessionId: session.id })
  client.dispose()
})

test("an attached transcript survives creation of another mock session", async () => {
  const client = createMockPrimeAgentClient()
  const workspace = createPrimeWorkspace({
    primeAgent: client,
    createId: (() => {
      const ids = ["admission-1", "command-1"]
      return () => ids.shift() ?? "unexpected-id"
    })(),
  })
  const first = await workspace.attachSession("mock-session-1")

  await first.chat.submitDraft("keep this transcript")
  await workspace.createSession({ cwd: "/workspace/two" })

  assert.equal(first.snapshot.messages.at(-1)?.content, "keep this transcript")
  await first.chat.stop()
  first.dispose()
  client.dispose()
})
