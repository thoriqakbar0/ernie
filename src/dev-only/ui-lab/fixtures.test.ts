import assert from "node:assert/strict"
import test from "node:test"

import { UI_LAB_SCENARIOS, parseUiLabRoute } from "./fixtures"

test("every UI lab scenario parses to a matching fixture", () => {
  for (const scenario of UI_LAB_SCENARIOS) {
    const route = parseUiLabRoute(`?scenario=${scenario}`)
    assert.equal(route.tag, "ready")
    if (route.tag === "ready") assert.equal(route.fixture.name, scenario)
  }
})

test("the default UI lab scenario is draft", () => {
  const route = parseUiLabRoute("")
  assert.equal(route.tag, "ready")
  if (route.tag === "ready") assert.equal(route.fixture.name, "draft")
})

test("an unknown UI lab scenario stays outside the fixture domain", () => {
  assert.deepEqual(parseUiLabRoute("?scenario=surprise"), {
    tag: "invalid",
    received: "surprise",
  })
})

test("only the empty scenario has no authoritative snapshot", () => {
  for (const scenario of UI_LAB_SCENARIOS) {
    const route = parseUiLabRoute(`?scenario=${scenario}`)
    assert.equal(route.tag, "ready")
    if (route.tag !== "ready") continue
    assert.equal(route.fixture.snapshots.length, scenario === "empty" ? 0 : 1)
  }
})
