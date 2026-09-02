import assert from "node:assert/strict"
import test from "node:test"

import { createPrimeWorkspace } from "../index"
import type {
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeAgentClient,
  PrimeSessionChange,
  PrimeSessionEventListener,
  PrimeSessionSnapshot,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionSummary,
  PrimeSessionSyncEvent,
  PromptAdmission,
  PromptRequest,
  SessionAction,
  SessionTextAction,
} from "../../prime-agent"
import { createPrimeUsefulSessionFixture } from "../../prime-agent/fixtures"

const existingSession: PrimeSessionSummary = {
  id: "session-1",
  cwd: "/workspace/ernie",
  name: "Ernie",
  lifecycle: "live",
  state: "idle",
}

const existingMessages = [
  { id: "message-1", role: "user" as const, content: "hello" },
  { id: "message-2", role: "assistant" as const, content: "hi" },
]

const existingSnapshot: PrimeSessionSnapshot = {
  session: existingSession,
  messages: existingMessages,
  useful: createPrimeUsefulSessionFixture(existingSession, existingMessages),
  transport: { status: "connected" },
}

function envelope(
  revision = 2,
  generation = "generation-1",
  snapshot = existingSnapshot,
): PrimeSessionSnapshotEnvelope {
  return {
    sessionId: snapshot.session.id,
    generation,
    revision,
    snapshot,
  }
}

function change(
  revision: number,
  value: PrimeSessionChange,
  generation = "generation-1",
): PrimeSessionSyncEvent {
  return {
    type: "change",
    envelope: {
      sessionId: "session-1",
      generation,
      revision,
      change: value,
    },
  }
}

class WorkspacePrimeAgent implements PrimeAgentClient {
  readonly createRequests: CreateSessionRequest[] = []
  readonly attachRequests: AttachSessionRequest[] = []
  readonly promptRequests: PromptRequest[] = []
  readonly followUpRequests: SessionTextAction[] = []
  readonly abortRequests: SessionAction[] = []
  readonly idleWaitRequests: SessionAction[] = []
  readonly listeners = new Map<string, Set<PrimeSessionEventListener>>()
  readonly operationOrder: string[] = []
  onAttach: (() => void) | undefined
  currentEnvelope: PrimeSessionSnapshotEnvelope

  constructor(
    private readonly sessions: readonly PrimeSessionSummary[] = [existingSession],
    initialEnvelope = envelope(),
  ) {
    this.currentEnvelope = initialEnvelope
  }

  listSessions(): Promise<readonly PrimeSessionSummary[]> {
    return Promise.resolve(this.sessions)
  }

  createSession(request: CreateSessionRequest): Promise<PrimeSessionSummary> {
    this.createRequests.push(request)
    return Promise.resolve(this.currentEnvelope.snapshot.session)
  }

  attachSession(request: AttachSessionRequest): Promise<PrimeSessionSnapshotEnvelope> {
    this.operationOrder.push("attach")
    this.attachRequests.push(request)
    this.onAttach?.()
    return Promise.resolve(this.currentEnvelope)
  }

  subscribeSession(sessionId: string, listener: PrimeSessionEventListener): () => void {
    this.operationOrder.push("subscribe")
    const listeners = this.listeners.get(sessionId) ?? new Set()
    listeners.add(listener)
    this.listeners.set(sessionId, listeners)
    return () => listeners.delete(listener)
  }

  emit(sessionId: string, event: PrimeSessionSyncEvent) {
    for (const listener of this.listeners.get(sessionId) ?? []) listener(event)
  }

  prompt(request: PromptRequest): Promise<PromptAdmission> {
    this.promptRequests.push(request)
    return Promise.resolve({
      admissionId: request.admissionId,
      commandId: request.commandId,
    })
  }

  followUp(request: SessionTextAction): Promise<void> {
    this.followUpRequests.push(request)
    return Promise.resolve()
  }

  abort(request: SessionAction): Promise<void> {
    this.abortRequests.push(request)
    return Promise.resolve()
  }

  waitForIdle(request: SessionAction): Promise<void> {
    this.idleWaitRequests.push(request)
    return Promise.resolve()
  }
}

function createIds(...ids: string[]) {
  let index = 0
  return () => ids[index++] ?? assert.fail("unexpected id request")
}

test("lists Prime Agent sessions without rewriting daemon state", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })

  assert.deepEqual(await workspace.listSessions(), [existingSession])
})

test("creates, subscribes, and returns the authoritative snapshot", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.createSession({
    cwd: "/workspace/ernie",
    name: "Ernie",
  })

  assert.deepEqual(primeAgent.createRequests, [
    { cwd: "/workspace/ernie", name: "Ernie" },
  ])
  assert.deepEqual(primeAgent.attachRequests, [{ sessionId: "session-1" }])
  assert.deepEqual(primeAgent.operationOrder, ["subscribe", "attach"])
  assert.equal(attached.snapshot, existingSnapshot)
})

test("buffers a change that races the first attachment snapshot", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  primeAgent.onAttach = () => {
    primeAgent.emit("session-1", change(3, {
      type: "message",
      message: { id: "message-3", role: "assistant", content: "raced" },
    }))
  }
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")

  assert.equal(attached.snapshot.messages.at(-1)?.content, "raced")
})

test("applies ordered changes and rejects stale revisions", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")
  const observedMessageIds: string[][] = []
  attached.subscribe(({ messages }) => {
    observedMessageIds.push(messages.map(({ id }) => id))
  })

  primeAgent.emit("session-1", change(3, {
    type: "message",
    message: { id: "message-3", role: "assistant", content: "new" },
  }))
  primeAgent.emit("session-1", change(2, {
    type: "session",
    session: { ...existingSession, state: "working" },
  }))

  assert.deepEqual(attached.snapshot.messages.map(({ id }) => id), [
    "message-1",
    "message-2",
    "message-3",
  ])
  assert.equal(attached.snapshot.session.state, "idle")
  assert.deepEqual(observedMessageIds, [["message-1", "message-2", "message-3"]])
})

test("uses a newer generation snapshot as the source of truth", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")
  const replacementSession = { ...existingSession, state: "recovering" as const }
  const replacementMessages = [{
    id: "replacement-1",
    role: "system" as const,
    content: "recovered",
  }]
  const replacement: PrimeSessionSnapshot = {
    session: replacementSession,
    messages: replacementMessages,
    useful: createPrimeUsefulSessionFixture(replacementSession, replacementMessages),
    transport: { status: "reconnecting", error: "daemon restarted" },
  }
  const replacementEnvelope = envelope(0, "generation-2", replacement)
  primeAgent.currentEnvelope = replacementEnvelope
  primeAgent.emit("session-1", { type: "snapshot", envelope: replacementEnvelope })

  assert.deepEqual(attached.snapshot, replacement)
})

test("recovers a revision gap from a newer authoritative snapshot", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")
  const recovered: PrimeSessionSnapshot = {
    ...existingSnapshot,
    messages: [
      ...existingSnapshot.messages,
      { id: "message-5", role: "assistant", content: "covered" },
    ],
  }
  primeAgent.currentEnvelope = envelope(5, "generation-1", recovered)
  primeAgent.emit("session-1", change(4, {
    type: "transport",
    transport: { status: "reconnecting" },
  }))

  await waitUntil(() => attached.snapshot.messages.at(-1)?.content === "covered")
  assert.equal(primeAgent.attachRequests.length, 2)
})

test("surfaces a failed snapshot recovery without hiding the error", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")
  primeAgent.attachSession = (request) => {
    primeAgent.attachRequests.push(request)
    return Promise.reject(new Error("Zenbu RPC disconnected"))
  }

  primeAgent.emit("session-1", change(4, {
    type: "transport",
    transport: { status: "reconnecting" },
  }))

  await waitUntil(() => attached.snapshot.transport.status === "failed")
  assert.deepEqual(attached.snapshot.transport, {
    status: "failed",
    error: "Zenbu RPC disconnected",
  })
  assert.equal(attached.snapshot.session.state, "recovering")
  assert.equal(primeAgent.attachRequests.length, 2)
})

test("repeated attachment never creates another session", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })

  const first = await workspace.attachSession("session-1")
  first.dispose()
  await workspace.attachSession("session-1")

  assert.equal(primeAgent.createRequests.length, 0)
  assert.deepEqual(primeAgent.attachRequests, [
    { sessionId: "session-1" },
    { sessionId: "session-1" },
  ])
})

test("two Ernie views share one Prime Agent client without creating sessions", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const [first, second] = await Promise.all([
    workspace.attachSession("session-1"),
    workspace.attachSession("session-1"),
  ])

  assert.equal(primeAgent.createRequests.length, 0)
  assert.equal(primeAgent.attachRequests.length, 2)
  assert.equal(primeAgent.listeners.get("session-1")?.size, 2)
  first.dispose()
  second.dispose()
})

test("disposal releases the owned Prime Agent event subscription", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })
  const attached = await workspace.attachSession("session-1")

  attached.dispose()
  primeAgent.emit("session-1", change(3, {
    type: "session",
    session: { ...existingSession, state: "working" },
  }))

  assert.equal(attached.snapshot.session.state, "idle")
})

test("routes every attached action through the snapshot session identity", async () => {
  const primeAgent = new WorkspacePrimeAgent()
  const workspace = createPrimeWorkspace({
    primeAgent,
    createId: createIds("admission-1", "command-1"),
  })
  const { chat } = await workspace.attachSession("session-1")

  await chat.submitDraft("build it")
  await chat.followUp("then test it")
  await chat.stop()

  assert.deepEqual(primeAgent.promptRequests, [{
    sessionId: "session-1",
    admissionId: "admission-1",
    commandId: "command-1",
    content: "build it",
  }])
  assert.deepEqual(primeAgent.followUpRequests, [
    { sessionId: "session-1", content: "then test it" },
  ])
  assert.deepEqual(primeAgent.abortRequests, [{ sessionId: "session-1" }])
  assert.deepEqual(primeAgent.idleWaitRequests, [{ sessionId: "session-1" }])
})

test("does not attach when session creation fails", async () => {
  const failure = new Error("create failed")
  const primeAgent = new WorkspacePrimeAgent()
  primeAgent.createSession = () => Promise.reject(failure)
  const workspace = createPrimeWorkspace({ primeAgent, createId: createIds() })

  await assert.rejects(
    workspace.createSession({ cwd: "/workspace/ernie" }),
    (error) => error === failure,
  )
  assert.equal(primeAgent.attachRequests.length, 0)
})

async function waitUntil(predicate: () => boolean) {
  const deadline = Date.now() + 1_000
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail("condition did not become true")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
