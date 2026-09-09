import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import test from "node:test"
import { promisify } from "node:util"
import { createMockPrimeAgentClient } from "../dev-only/prime-agent/mock"
import { createPrimeUsefulSessionFixture } from "../packages/prime-agent/fixtures"
import { createZenbuPrimeAgentClient } from "../packages/prime-agent/zenbu"
import { createPrimeWorkspace } from "../packages/prime-workspace"

const createBroadcast = () => {
  const listeners = new Set<(input: unknown) => void>()
  return {
    emit(input: unknown) {
      for (const listener of listeners) {
        listener(input)
      }
    },
    subscribe(listener: (input: unknown) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// @lat: [[tests#Behavior specifications#Daemon boundary#Renderer event routing]]
test("renderer attachments validate and isolate serialized broadcasts across subscription lifetimes", async (t) => {
  const native = createMockPrimeAgentClient()
  t.after(() => native.dispose())
  const initial = await native.attachSession({ sessionId: "mock-session-1" })
  let responseBody: unknown = initial
  const server = createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify(responseBody))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(async () => {
    server.closeAllConnections()
    await promisify(server.close.bind(server))()
  })
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const readResponse = async (): Promise<unknown> => {
    const response = await fetch(`http://127.0.0.1:${address.port}`)
    return response.json()
  }
  const changes = createBroadcast()
  const snapshots = createBroadcast()
  const states = createBroadcast()
  const client = createZenbuPrimeAgentClient(
    { ...native, attachSession: readResponse, connectDaemon: readResponse },
    {
      primeSessionChanged: changes,
      primeSessionSnapshot: snapshots,
      primeSessionStateChanged: states,
    },
  )
  t.after(() => client.dispose())
  const workspace = createPrimeWorkspace({ createId: () => "fixture-command", primeAgent: client })
  const publish = async (channel: ReturnType<typeof createBroadcast>, payload: unknown) => {
    responseBody = payload
    channel.emit(await readResponse())
  }

  // Broadcasts before attachment are not replayed into later subscriptions.
  await publish(snapshots, { ...initial, revision: initial.revision + 50 })
  responseBody = initial
  const attached = await workspace.attachSession(initial.sessionId)
  t.after(() => attached.dispose())
  const received: string[] = []
  const unsubscribe = attached.subscribe((snapshot) => received.push(snapshot.session.name ?? ""))
  const renamed = {
    ...initial,
    revision: initial.revision + 1,
    snapshot: {
      ...initial.snapshot,
      session: { ...initial.snapshot.session, name: "Observed update" },
    },
  }
  const otherSession = { ...renamed.snapshot.session, id: "other-session" }
  await publish(snapshots, {
    ...renamed,
    sessionId: otherSession.id,
    snapshot: {
      ...renamed.snapshot,
      session: otherSession,
      useful: createPrimeUsefulSessionFixture(otherSession),
    },
  })
  await publish(snapshots, { ...renamed, snapshot: { ...renamed.snapshot, messages: "invalid" } })
  await publish(snapshots, null)
  await publish(changes, { change: "invalid", sessionId: initial.sessionId })
  assert.equal(attached.snapshot.session.name, initial.snapshot.session.name)
  assert.deepEqual(received, [])

  await publish(snapshots, renamed)
  assert.equal(attached.snapshot.session.name, "Observed update")
  await publish(changes, {
    change: { session: { ...renamed.snapshot.session, name: "Ordered change" }, type: "session" },
    generation: initial.generation,
    revision: initial.revision + 2,
    sessionId: initial.sessionId,
  })
  assert.equal(attached.snapshot.session.name, "Ordered change")
  assert.deepEqual(received, ["Observed update", "Ordered change"])

  let observerEvents = 0
  const stopObserver = client.subscribeSession(initial.sessionId, () => {
    observerEvents += 1
  })
  attached.dispose()
  await publish(snapshots, renamed)
  assert.equal(observerEvents, 1)
  assert.equal(attached.snapshot.session.name, "Ordered change")
  stopObserver()
  await publish(snapshots, renamed)
  assert.equal(observerEvents, 1)
  const stopNewObserver = client.subscribeSession(initial.sessionId, () => {
    observerEvents += 1
  })
  await publish(snapshots, renamed)
  assert.equal(observerEvents, 2)
  stopNewObserver()
  unsubscribe()

  responseBody = await native.getSessionState()
  assert.deepEqual(await client.connectDaemon(), responseBody)
  responseBody = { revision: "invalid", sessions: [] }
  await assert.rejects(client.connectDaemon(), /invalid session state envelope/u)
  let afterDisposal = 0
  client.subscribeSession(initial.sessionId, () => {
    afterDisposal += 1
  })
  client.dispose()
  await publish(snapshots, renamed)
  await publish(changes, { sessionId: initial.sessionId })
  assert.equal(afterDisposal, 0)
})
