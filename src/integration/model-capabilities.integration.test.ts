import assert from "node:assert/strict"
import test from "node:test"
import type { AgentConnectionModel } from "prime-agent"
import { projectModelCatalog } from "../main/prime-agent/model-catalog"

const model: AgentConnectionModel = {
  api: "openai-codex-responses",
  baseUrl: "https://example.invalid",
  contextWindow: 272_000,
  cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
  id: "fixture-luna",
  input: ["text"],
  maxTokens: 128_000,
  name: "Fixture Luna",
  provider: "openai-codex",
  reasoning: true,
  thinkingLevelMap: { max: "max", minimal: null, xhigh: "xhigh" },
}

test("catalog worker preserves native provider-specific effort capabilities", async () => {
  // Explicit metadata avoids registry credentials, daemon connections, and provider requests.
  const catalog = await projectModelCatalog([
    model,
    { ...model, provider: "openai", thinkingLevelMap: { ...model.thinkingLevelMap, off: null } },
    { ...model, id: "fixture-nonreasoning", reasoning: false },
  ])
  assert.deepEqual(
    catalog.map((entry) => entry.supportedEfforts),
    [
      ["off", "low", "medium", "high", "xhigh", "max"],
      ["low", "medium", "high", "xhigh", "max"],
      ["off"],
    ],
  )
  assert.equal(catalog[0]?.label, model.name)
  assert.equal(catalog[0]?.provider, model.provider)
})
