import assert from "node:assert/strict"
import test from "node:test"

import { createMockPrimeAgentClient } from "../../../dev-only/prime-agent/mock"
import { createPrimeWorkspace } from "../../prime-workspace"

test("authoritative seeds define the mock session list and transport", async () => {
  const client = createMockPrimeAgentClient({
    initialSnapshots: [{
      session: {
        id: "seeded-session",
        cwd: "/workspace/seeded",
        name: "Seeded session",
        lifecycle: "live",
        state: "recovering",
      },
      messages: [{ id: "seeded-message", role: "assistant", content: "Still here" }],
      transport: { status: "failed", error: "Seeded failure" },
    }],
  })

  assert.deepEqual(await client.listSessions(), [{
    id: "seeded-session",
    cwd: "/workspace/seeded",
    name: "Seeded session",
    lifecycle: "live",
    state: "recovering",
  }])
  assert.deepEqual(
    (await client.attachSession({ sessionId: "seeded-session" })).snapshot,
    {
      session: {
        id: "seeded-session",
        cwd: "/workspace/seeded",
        name: "Seeded session",
        lifecycle: "live",
        state: "recovering",
      },
      messages: [{ id: "seeded-message", role: "assistant", content: "Still here" }],
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
  assert.deepEqual(secondEvents, ["session", "message"])
  unsubscribeFirst()
  unsubscribeSecond()
  await client.abort({ sessionId: created.id })
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
