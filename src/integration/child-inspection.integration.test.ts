import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import { SessionManager } from "prime-agent"
import { inspectNativeChild } from "../main/prime-agent/child-inspection"
import { createPrimeUsefulSessionFixture } from "../packages/prime-agent/fixtures"
import type {
  PrimeRlmChild,
  PrimeSessionSnapshot,
  PrimeSessionSummary,
} from "../packages/prime-agent"

const saveChild = async (root: string, id: string, parentSession: string, depth: number) => {
  const sessionDir = path.join(root, id)
  const manager = SessionManager.create(root, sessionDir)
  manager.newSession({ parentSession, rlmDepth: depth })
  manager.appendSessionInfo(id)
  manager.appendMessage({ content: `${id} transcript`, role: "user", timestamp: Date.now() })
  manager.flushNow()
  const sessionFile = manager.getSessionFile()
  assert.ok(sessionFile)
  await writeFile(
    path.join(sessionDir, "rlm-subagent.json"),
    JSON.stringify({ childId: id, sessionFile, type: "rlm_subagent" }),
  )
  const child: PrimeRlmChild = { id, label: id, sessionDir, status: "done" }
  return { child, sessionFile, sessionId: manager.getSessionId() }
}

test("nested inspection follows saved native parent edges without opening a live session", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "ernie-child-inspection-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const parent = SessionManager.create(root, path.join(root, "root"))
  parent.flushNow()
  const parentFile = parent.getSessionFile()
  assert.ok(parentFile)
  const first = await saveChild(root, "first", parentFile, 1)
  const second = await saveChild(root, "second", first.sessionFile, 2)
  const nested = { ...second.child, parentId: first.child.id }
  const children = [first.child, nested]
  const input = {
    childId: second.child.id,
    children,
    parent: { sessionFile: parentFile, sessionId: parent.getSessionId() },
    readLive: () => Promise.reject(new Error("Fixture must never connect to a daemon")),
  }
  const inspection = await inspectNativeChild(input)
  assert.equal(inspection.source, "saved")
  assert.equal(inspection.sessionId, second.sessionId)
  assert.equal(inspection.messages.length, 1)
  assert.equal(inspection.messages[0]?.role, "user")
  const liveSession: PrimeSessionSummary = {
    cwd: root,
    id: second.sessionId,
    lifecycle: "live",
    state: "idle",
  }
  const liveSnapshot: PrimeSessionSnapshot = {
    messages: inspection.messages,
    session: liveSession,
    transport: { status: "connected" },
    useful: {
      ...createPrimeUsefulSessionFixture(liveSession, inspection.messages),
      parent: { childId: nested.id, sessionId: first.sessionId },
    },
  }
  const liveInput = {
    ...input,
    children: [first.child, { ...nested, activeSessionId: "active-second" }],
    readLive: (activeSessionId: string) => {
      assert.equal(activeSessionId, "active-second")
      return Promise.resolve(liveSnapshot)
    },
  }
  const liveInspection = await inspectNativeChild(liveInput)
  assert.equal(liveInspection.source, "live")
  await assert.rejects(
    inspectNativeChild({
      ...liveInput,
      readLive: () =>
        Promise.resolve({
          ...liveSnapshot,
          useful: {
            ...liveSnapshot.useful,
            parent: { childId: nested.id, sessionId: parent.getSessionId() },
          },
        }),
    }),
    /identity changed/u,
  )
  await assert.rejects(
    inspectNativeChild({ ...input, children: [nested] }),
    /does not belong to this parent/u,
  )
  await assert.rejects(
    inspectNativeChild({
      ...input,
      children: [{ ...first.child, parentId: second.child.id }, nested],
    }),
    /cyclic/u,
  )
  const outsider = await saveChild(root, "outsider", path.join(root, "unrelated.jsonl"), 2)
  await assert.rejects(
    inspectNativeChild({
      ...input,
      childId: outsider.child.id,
      children: [first.child, { ...outsider.child, parentId: first.child.id }],
    }),
    /does not belong to this parent/u,
  )
})
