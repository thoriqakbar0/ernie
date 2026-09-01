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
      sessionFile: "/sessions/session-1.jsonl",
      sessionDir: "/sessions/session-1",
      leafId: "entry-2",
      isStreaming: true,
      isCompacting: false,
      isBashRunning: false,
      retryAttempt: 0,
      steeringMode: "all",
      followUpMode: "one-at-a-time",
      autoCompactionEnabled: true,
      messageCount: 1,
      sessionActions: {
        queuedCount: 1,
        steering: ["focus on the contract"],
        followUps: [],
        active: { kind: "turn", phase: "running", label: "Answering" },
      },
      compactionCount: 2,
      goal: {
        active: true,
        status: "active",
        objective: "Preserve useful state",
        tokensUsed: 120,
        timeUsedSeconds: 12,
        continuationsUsed: 1,
      },
      heartbeat: null,
      scopedModels: [{
        model: { id: "gpt-5", provider: "openai", name: "GPT-5" },
        thinkingLevel: "high",
      }],
      activeToolNames: ["bash", "ipython"],
      contextUsage: { tokens: 1200, contextWindow: 128000, percent: 0.01 },
      recap: "Projecting Prime Agent state",
      thinkingLevel: "high",
      serviceTier: "auto",
      availableThinkingLevels: ["off", "high"],
      model: { id: "gpt-5", provider: "openai", name: "GPT-5" },
    },
    messages: [{ role: "user", content: "hello", timestamp: 1 }],
    streamingMessage: {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "inspect the contract", signature: "private" },
        { type: "text", text: streamingText },
        { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "jj status" } },
      ],
      timestamp: 2,
      provider: "openai",
      model: "gpt-5",
    },
    sessionContext: {
      messages: [{ role: "user", content: "hello", timestamp: 1 }],
      thinkingLevel: "high",
      serviceTier: "auto",
      model: { provider: "openai", modelId: "gpt-5" },
    },
    sessionTree: {
      tree: [{
        entry: {
          type: "message",
          id: "entry-1",
          parentId: null,
          timestamp: "2026-09-01T00:00:00.000Z",
          message: { role: "user", content: "hello", timestamp: 1 },
        },
        children: [],
      }],
      leafId: "entry-2",
    },
    parent: {
      activeSessionId: "parent-active",
      sessionId: "parent-session",
      nodeId: "parent-node",
      childId: "child-1",
    },
    children: [{
      id: "child-1",
      parentId: "root",
      activeSessionId: "child-active",
      sessionName: "reviewer",
      model: "openai/gpt-5",
      label: "Review the projection",
      status: "running",
      durationMs: 250,
      answerPreview: "Reviewing",
      repliedSinceTask: false,
      toolUseCount: 2,
      tokenCount: 300,
      recap: "Checking JSON safety",
      sessionDir: "/sessions/child-1",
      activity: { kind: "executing", toolName: "bash" },
    }],
    lastEventSequence: 42,
    lastEventCursor: { generation: "daemon-generation", sequence: 42 },
    replay: {
      status: "complete",
      fromSequence: 1,
      toSequence: 42,
      fromCursor: { generation: "daemon-generation", sequence: 1 },
      toCursor: { generation: "daemon-generation", sequence: 42 },
    },
  }
}

test("uses the stored session id when no active session id is present", () => {
  const snapshot = connectionSnapshot("hello")
  Reflect.deleteProperty(snapshot.state, "activeSessionId")

  const projected = projectPrimeSessionSnapshot(snapshot)

  assert.equal(projected.session.id, "stored-session-1")
  assert.equal(projected.useful.state.sessionId, "stored-session-1")
})

test("projects stable structured state across streaming updates", () => {
  const first = projectPrimeSessionSnapshot(connectionSnapshot("hel"), previousSession)
  const second = projectPrimeSessionSnapshot(connectionSnapshot("hello"), first.session)

  assert.equal(first.session.lifecycle, "live")
  assert.equal(first.session.state, "working")
  assert.equal(first.messages[1]?.id, second.messages[1]?.id)
  assert.equal(first.useful.state.sessionActions.steering[0], "focus on the contract")
  assert.equal(first.useful.children[0]?.activity?.toolName, "bash")
  assert.equal(first.useful.lastEventCursor?.sequence, 42)
  assert.deepEqual(first.useful.streamingMessage?.content, [
    { type: "thinking", thinking: "inspect the contract", signature: "private" },
    { type: "text", text: "hel" },
    { type: "toolCall", id: "tool-1", name: "bash", arguments: { command: "jj status" } },
  ])
  assert.deepEqual(diffPrimeSessionSnapshots(first, second), [
    { type: "message", message: second.messages[1] },
    {
      type: "structured",
      structuredMessages: second.useful.structuredMessages,
      streamingMessage: second.useful.streamingMessage,
    },
  ])
})

test("replaces messages when the authoritative order shrinks", () => {
  const previous = projectPrimeSessionSnapshot(connectionSnapshot("hello"), previousSession)
  const next = { ...previous, messages: previous.messages.slice(1) }

  assert.deepEqual(diffPrimeSessionSnapshots(previous, next), [{
    type: "messages",
    messages: next.messages,
  }])
})

test("projects useful state, family, and event changes independently", () => {
  const previous = projectPrimeSessionSnapshot(connectionSnapshot("hello"), previousSession)
  const next = {
    ...previous,
    useful: {
      ...previous.useful,
      state: { ...previous.useful.state, recap: "Updated recap" },
      children: [{ ...previous.useful.children[0]!, status: "done" as const }],
      lastEventSequence: 43,
    },
  }

  assert.deepEqual(diffPrimeSessionSnapshots(previous, next), [
    { type: "usefulState", state: next.useful.state },
    {
      type: "family",
      parent: next.useful.parent,
      sessionTree: next.useful.sessionTree,
      children: next.useful.children,
    },
    {
      type: "eventPosition",
      lastEventSequence: 43,
      lastEventCursor: next.useful.lastEventCursor,
      replay: next.useful.replay,
    },
  ])
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


test("uses null before Prime Agent reports context usage", () => {
  const base = connectionSnapshot("hello")
  const { contextUsage: _contextUsage, ...state } = base.state

  assert.equal(
    projectPrimeSessionSnapshot({ ...base, state }, previousSession).useful.state.contextUsage,
    null,
  )
})

test("rejects non-JSON values in useful session state", () => {
  const snapshot = connectionSnapshot("hello")
  snapshot.state.contextUsage = { tokens: Number.POSITIVE_INFINITY, contextWindow: 1, percent: 1 }

  assert.throws(
    () => projectPrimeSessionSnapshot(snapshot, previousSession),
    /non-JSON context usage/,
  )
})

test("preserves unsupported array positions as JSON null values", () => {
  const base = connectionSnapshot("hello")
  const snapshot = {
    ...base,
    state: { ...base.state, contextUsage: [1, undefined, 3] },
  }

  assert.deepEqual(
    projectPrimeSessionSnapshot(snapshot, previousSession).useful.state.contextUsage,
    [1, null, 3],
  )
})
