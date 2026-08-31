import assert from "node:assert/strict"
import test from "node:test"

import type { PrimeSessionSummary } from "../../packages/prime-agent"
import { chooseAvailableSessionName } from "./session-name"

const session = (name?: string): PrimeSessionSummary => ({
  id: name ?? "unnamed",
  cwd: "/workspace/ernie",
  name,
  lifecycle: "draft",
  state: "idle",
})

test("keeps the requested Prime Agent name when it is available", () => {
  assert.equal(chooseAvailableSessionName("New session", [session("Existing")]), "New session")
})

test("uses the first available numeric suffix for a resident agent", () => {
  assert.equal(chooseAvailableSessionName("New session", [
    session("New session"),
    session("New session 2"),
    session("New session 4"),
  ]), "New session 3")
})

test("leaves an unnamed Prime Agent session unnamed", () => {
  assert.equal(chooseAvailableSessionName(undefined, [session("Existing")]), undefined)
})
