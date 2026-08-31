import assert from "node:assert/strict"
import test from "node:test"

import {
  diffPrimeSessionSnapshots,
  projectPrimeSessionSnapshot,
} from "./projection"

const previousSession = {
  id: "session-1",
  cwd: "/workspace/ernie",
  name: "Ernie",
  lifecycle: "draft" as const,
  state: "idle" as const,
}

function connectionSnapshot(streamingText: string) {
  return {
    state: {
      activeSessionId: "session-1",
      sessionId: "stored-session-1",
      cwd: "/workspace/ernie",
      sessionName: "Ernie",
      isStreaming: true,
      isCompacting: false,
      isBashRunning: false,
      model: { id: "gpt-5", provider: "openai", name: "GPT-5" },
    },
    messages: [{ role: "user", content: "hello", timestamp: 1 }],
    streamingMessage: {
      role: "assistant",
      content: [{ type: "text", text: streamingText }],
      timestamp: 2,
    },
  }
}

test("projects stable message identities across streaming updates", () => {
  const first = projectPrimeSessionSnapshot(connectionSnapshot("hel"), previousSession)
  const second = projectPrimeSessionSnapshot(connectionSnapshot("hello"), first.session)

  assert.equal(first.session.lifecycle, "live")
  assert.equal(first.session.state, "working")
  assert.equal(first.messages[1]?.id, second.messages[1]?.id)
  assert.deepEqual(diffPrimeSessionSnapshots(first, second), [{
    type: "message",
    message: second.messages[1],
  }])
})

test("replaces messages when the authoritative order shrinks", () => {
  const previous = projectPrimeSessionSnapshot(connectionSnapshot("hello"), previousSession)
  const next = { ...previous, messages: previous.messages.slice(1) }

  assert.deepEqual(diffPrimeSessionSnapshots(previous, next), [{
    type: "messages",
    messages: next.messages,
  }])
})

test("projects session and transport changes independently", () => {
  const previous = projectPrimeSessionSnapshot(connectionSnapshot("hello"), previousSession)
  const next = {
    ...previous,
    session: { ...previous.session, state: "recovering" as const },
    transport: { status: "reconnecting" as const, error: "Prime Agent is reconnecting" },
  }

  assert.deepEqual(diffPrimeSessionSnapshots(previous, next), [
    { type: "session", session: next.session },
    { type: "transport", transport: next.transport },
  ])
})
