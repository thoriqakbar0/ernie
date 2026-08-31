import assert from "node:assert/strict"
import test from "node:test"

import { createChatSession as createChatSessionCore } from "../index"
import type {
  AttachSessionRequest,
  CreateSessionRequest,
  PrimeSessionSnapshotEnvelope,
  PrimeSessionSummary,
  PrimeSessionEventListener,
  PrimeAgentClient,
  PromptAdmission,
  PromptRequest,
  SessionAction,
  SessionTextAction,
} from "../../prime-agent"

type ControlledCall = Readonly<{
  request: PromptRequest
  completion: PromiseWithResolvers<PromptAdmission>
}>

class ControlledPrimeAgent implements PrimeAgentClient {
  readonly calls: ControlledCall[] = []
  readonly followUps: SessionTextAction[] = []
  readonly aborts: SessionAction[] = []
  readonly idleWaits: SessionAction[] = []
  private idleCompletion: PromiseWithResolvers<void> | undefined

  listSessions(): Promise<readonly PrimeSessionSummary[]> {
    return Promise.resolve([])
  }

  createSession(_request: CreateSessionRequest): Promise<PrimeSessionSummary> {
    return Promise.reject(new Error("session creation is not configured in this test"))
  }

  attachSession(_request: AttachSessionRequest): Promise<PrimeSessionSnapshotEnvelope> {
    return Promise.reject(new Error("session attachment is not configured in this test"))
  }

  subscribeSession(_sessionId: string, _listener: PrimeSessionEventListener): () => void {
    return () => {}
  }

  prompt(request: PromptRequest): Promise<PromptAdmission> {
    const completion = Promise.withResolvers<PromptAdmission>()
    this.calls.push({ request, completion })
    return completion.promise
  }

  followUp(request: SessionTextAction): Promise<void> {
    this.followUps.push(request)
    return Promise.resolve()
  }

  abort(request: SessionAction): Promise<void> {
    this.aborts.push(request)
    return Promise.resolve()
  }

  waitForIdle(request: SessionAction): Promise<void> {
    this.idleWaits.push(request)
    return this.idleCompletion?.promise ?? Promise.resolve()
  }

  holdIdleConfirmation() {
    this.idleCompletion = Promise.withResolvers<void>()
    return this.idleCompletion
  }

  admit(index: number) {
    const call = this.calls[index]
    assert.ok(call, `Prime Agent call ${index} must exist before admission`)
    call.completion.resolve({
      admissionId: call.request.admissionId,
      commandId: call.request.commandId,
    })
  }

  reject(index: number, error: Error) {
    const call = this.calls[index]
    assert.ok(call, `Prime Agent call ${index} must exist before rejection`)
    call.completion.reject(error)
  }
}

function createIds(...ids: string[]) {
  let allocationCount = 0

  return {
    createId() {
      const id = ids[allocationCount]
      allocationCount += 1
      return id ?? assert.fail("unexpected id request")
    },
    get allocationCount() {
      return allocationCount
    },
  }
}

function createChatSession(input: Readonly<{
  primeAgent: PrimeAgentClient
  createId: () => string
}>) {
  return createChatSessionCore({ ...input, sessionId: "session-1" })
}

function withPrompt(
  base: ControlledPrimeAgent,
  prompt: PrimeAgentClient["prompt"],
): PrimeAgentClient {
  return {
    listSessions: () => base.listSessions(),
    createSession: (request) => base.createSession(request),
    attachSession: (request) => base.attachSession(request),
    subscribeSession: (sessionId, listener) => base.subscribeSession(sessionId, listener),
    prompt,
    followUp: (request) => base.followUp(request),
    abort: (request) => base.abort(request),
    waitForIdle: (request) => base.waitForIdle(request),
  }
}

test("submits exact draft content and returns Prime Agent admission", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const ids = createIds("admission-1", "command-1")
  const session = createChatSession({ primeAgent, createId: ids.createId })

  const submission = session.submitDraft("  hello\nPrime Agent  ")

  assert.deepEqual(primeAgent.calls.map(({ request }) => request), [
    {
      sessionId: "session-1",
      admissionId: "admission-1",
      commandId: "command-1",
      content: "  hello\nPrime Agent  ",
    },
  ])

  primeAgent.admit(0)
  assert.deepEqual(await submission, {
    status: "admitted",
    admission: {
      admissionId: "admission-1",
      commandId: "command-1",
    },
  })
})

for (const content of ["", " ", "\t", "\n", " \t\n "]) {
  test(`ignores empty draft ${JSON.stringify(content)}`, async () => {
    const primeAgent = new ControlledPrimeAgent()
    const ids = createIds()
    const session = createChatSession({ primeAgent, createId: ids.createId })

    assert.deepEqual(await session.submitDraft(content), {
      status: "ignored",
      reason: "empty",
    })
    assert.equal(primeAgent.calls.length, 0)
    assert.equal(ids.allocationCount, 0)
  })
}

test("admits sequential drafts with independent identities", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const ids = createIds("admission-1", "command-1", "admission-2", "command-2")
  const session = createChatSession({ primeAgent, createId: ids.createId })

  const first = session.submitDraft("first")
  primeAgent.admit(0)
  await first

  const second = session.submitDraft("second")
  primeAgent.admit(1)

  assert.deepEqual(await second, {
    status: "admitted",
    admission: {
      admissionId: "admission-2",
      commandId: "command-2",
    },
  })
  assert.deepEqual(primeAgent.calls.map(({ request }) => request.content), ["first", "second"])
  assert.equal(ids.allocationCount, 4)
})

test("reopens admission after Prime Agent rejects", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const ids = createIds("admission-1", "command-1", "admission-2", "command-2")
  const session = createChatSession({ primeAgent, createId: ids.createId })
  const failure = new Error("daemon unavailable")

  const failed = session.submitDraft("first")
  primeAgent.reject(0, failure)
  await assert.rejects(failed, (error) => error === failure)

  const retry = session.submitDraft("second")
  primeAgent.admit(1)
  assert.equal((await retry).status, "admitted")
  assert.equal(primeAgent.calls.length, 2)
})

test("reopens admission after a synchronous Prime Agent failure", async () => {
  const failure = new Error("synchronous transport failure")
  let callCount = 0
  const primeAgent = withPrompt(
    new ControlledPrimeAgent(),
    () => {
      callCount += 1
      throw failure
    },
  )
  const ids = createIds("admission-1", "command-1", "admission-2", "command-2")
  const session = createChatSession({ primeAgent, createId: ids.createId })

  await assert.rejects(session.submitDraft("first"), (error) => error === failure)
  await assert.rejects(session.submitDraft("second"), (error) => error === failure)
  assert.equal(callCount, 2)
})

for (const failingAllocation of [1, 2]) {
  test(`reopens admission after id allocation ${failingAllocation} fails`, async () => {
    const failure = new Error(`id ${failingAllocation} failed`)
    const primeAgent = new ControlledPrimeAgent()
    let allocationCount = 0
    const session = createChatSession({
      primeAgent,
      createId() {
        allocationCount += 1
        if (allocationCount === failingAllocation) throw failure
        return `id-${allocationCount}`
      },
    })

    await assert.rejects(session.submitDraft("first"), (error) => error === failure)

    const retry = session.submitDraft("second")
    primeAgent.admit(0)
    assert.equal((await retry).status, "admitted")
    assert.equal(primeAgent.calls.length, 1)
  })
}

test("blocks re-entry while allocating request identities", async () => {
  const primeAgent = new ControlledPrimeAgent()
  let nestedSubmission: Promise<unknown> | undefined
  let session: ReturnType<typeof createChatSession>
  const ids = createIds("admission-1", "command-1")
  session = createChatSession({
    primeAgent,
    createId() {
      nestedSubmission ??= session.submitDraft("nested")
      return ids.createId()
    },
  })

  const submission = session.submitDraft("outer")

  assert.deepEqual(await nestedSubmission, { status: "ignored", reason: "pending" })
  assert.equal(primeAgent.calls.length, 1)
  primeAgent.admit(0)
  await submission
})

test("blocks re-entry from the Prime Agent call", async () => {
  const controlledPrimeAgent = new ControlledPrimeAgent()
  let nestedSubmission: Promise<unknown> | undefined
  let session: ReturnType<typeof createChatSession>
  const primeAgent = withPrompt(
    controlledPrimeAgent,
    (request) => {
      nestedSubmission = session.submitDraft("nested")
      return controlledPrimeAgent.prompt(request)
    },
  )
  const ids = createIds("admission-1", "command-1")
  session = createChatSession({ primeAgent, createId: ids.createId })

  const submission = session.submitDraft("outer")

  assert.deepEqual(await nestedSubmission, { status: "ignored", reason: "pending" })
  assert.equal(controlledPrimeAgent.calls.length, 1)
  controlledPrimeAgent.admit(0)
  await submission
})

test("keeps admission pending until an immediate response settles", async () => {
  const ids = createIds("admission-1", "command-1")
  const primeAgent = withPrompt(
    new ControlledPrimeAgent(),
    (request) => {
      return Promise.resolve({
        admissionId: request.admissionId,
        commandId: request.commandId,
      })
    },
  )
  const session = createChatSession({ primeAgent, createId: ids.createId })

  const submission = session.submitDraft("first")

  assert.deepEqual(await session.submitDraft("same turn"), {
    status: "ignored",
    reason: "pending",
  })
  assert.equal((await submission).status, "admitted")
})

test("keeps pending state local to each chat session", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const firstIds = createIds("admission-1", "command-1")
  const secondIds = createIds("admission-2", "command-2")
  const firstSession = createChatSession({ primeAgent, createId: firstIds.createId })
  const secondSession = createChatSession({ primeAgent, createId: secondIds.createId })

  const first = firstSession.submitDraft("first")
  const second = secondSession.submitDraft("second")

  assert.equal(primeAgent.calls.length, 2)
  primeAgent.admit(0)
  primeAgent.admit(1)
  await Promise.all([first, second])
})

test("queues exact follow-up content for the attached session", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const session = createChatSession({ primeAgent, createId: createIds().createId })

  assert.equal(await session.followUp("  next\nstep  "), "queued")
  assert.deepEqual(primeAgent.followUps, [
    { sessionId: "session-1", content: "  next\nstep  " },
  ])
})

test("ignores an empty follow-up without calling Prime Agent", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const session = createChatSession({ primeAgent, createId: createIds().createId })

  assert.equal(await session.followUp(" \n "), "ignored-empty")
  assert.equal(primeAgent.followUps.length, 0)
})

test("aborts work in the attached session", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const session = createChatSession({ primeAgent, createId: createIds().createId })

  await session.stop()

  assert.deepEqual(primeAgent.aborts, [{ sessionId: "session-1" }])
  assert.deepEqual(primeAgent.idleWaits, [{ sessionId: "session-1" }])
})

test("does not finish stopping before Prime Agent confirms idle", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const idleConfirmation = primeAgent.holdIdleConfirmation()
  const session = createChatSession({ primeAgent, createId: createIds().createId })
  let stopFinished = false

  const stopping = session.stop().then(() => {
    stopFinished = true
  })
  await Promise.resolve()

  assert.equal(stopFinished, false)
  assert.deepEqual(primeAgent.aborts, [{ sessionId: "session-1" }])
  idleConfirmation.resolve()
  await stopping
  assert.equal(stopFinished, true)
})

test("bounds Prime Agent work during a ten-thousand submission burst", async () => {
  const primeAgent = new ControlledPrimeAgent()
  const ids = createIds("admission-1", "command-1")
  const session = createChatSession({ primeAgent, createId: ids.createId })
  const activeSubmission = session.submitDraft("active")

  const duplicateResults = await Promise.all(
    Array.from({ length: 10_000 }, (_, index) => session.submitDraft(`duplicate-${index}`)),
  )

  assert.ok(
    duplicateResults.every(
      (result) => result.status === "ignored" && result.reason === "pending",
    ),
  )
  assert.equal(primeAgent.calls.length, 1)
  assert.equal(ids.allocationCount, 2)

  primeAgent.admit(0)
  await activeSubmission
})
