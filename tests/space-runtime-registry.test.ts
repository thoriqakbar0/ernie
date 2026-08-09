import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { AgentState } from "../src/shared/contract";
import type { WorkspaceSnapshot } from "../src/shared/workspace";
import type { PrimeAgentRpcInstance } from "../src/main/PrimeAgentRpc";
import { make, SpaceRuntimeRegistryError } from "../src/main/SpaceRuntimeRegistry";

const readyState = (overrides: Partial<AgentState> = {}): AgentState => ({
  connection: "ready", detail: "ready", executionTarget: "local", sessionId: "", sessionName: "",
  provider: "test", modelId: "m", modelName: "Model", thinkingLevel: "", isStreaming: false,
  isCompacting: false, messageCount: 0, queuedCount: 0, contextTokens: 0, contextWindow: 0,
  contextPercent: 0, totalTokens: 0, cost: "$0.0000", ...overrides,
});

const snapshot: WorkspaceSnapshot = {
  projects: [
    { id: "space-a", path: "/catalog/a", label: "A", worktreeIds: ["space-a", "worktree-a"] },
    { id: "space-b", path: "/catalog/b", label: "B", worktreeIds: [] },
    { id: "space-c", path: "/catalog/c", label: "C", worktreeIds: [] },
    { id: "space-d", path: "/catalog/d", label: "D", worktreeIds: [] },
  ],
  worktrees: [
    { id: "space-a", path: "/catalog/a-root-worktree", label: "A root" },
    { id: "worktree-a", path: "/catalog/a-worktree", label: "A branch" },
    { id: "orphan-worktree", path: "/catalog/orphan", label: "Orphan" },
  ], agents: [], updatedAt: "2026-01-01T00:00:00.000Z",
};

interface OpenRecord { readonly cwd: string; readonly depth: number; stopped: boolean; state: AgentState; configured: unknown[] }

function fakeFactory(records: OpenRecord[]) {
  return {
    open: (cwd: string, depth: number) => Effect.sync(() => {
      const record: OpenRecord = { cwd, depth, stopped: false, state: readyState(), configured: [] };
      records.push(record);
      const runtime: PrimeAgentRpcInstance = {
        start: Effect.void,
        stop: Effect.sync(() => { record.stopped = true; }),
        state: Effect.sync(() => record.state),
        events: Stream.empty,
        availableCommands: Effect.succeed([]),
        availableModels: Effect.succeed([{ provider: "provider", id: "m", name: "Model", thinkingLevels: ["off", "high"] }]),
        currentModel: Effect.succeed({ provider: "provider", id: "m", name: "Model", thinkingLevels: ["off", "high"] }),
        setModel: (model) => Effect.succeed({ ...model, name: model.id, thinkingLevels: ["off", "high"] }),
        getRlmMaxDepthStatus: Effect.succeed({ maxDepth: depth, source: "chat" }),
        setRlmMaxDepth: (maxDepth) => Effect.succeed({ maxDepth, source: "chat" }),
        configureThenPrompt: (configuration) => Effect.sync(() => { record.configured.push(configuration); }),
        command: () => Effect.succeed({}),
      };
      return runtime;
    }),
  };
}

describe("SpaceRuntimeRegistry", () => {
  it("authorizes Space IDs from the catalog and never accepts a renderer cwd", async () => {
    const records: OpenRecord[] = [];
    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const registry = yield* make({ snapshot: Effect.succeed(snapshot), runtimeFactory: fakeFactory(records) });
      yield* registry.availableModels("space-a");
      yield* registry.state("worktree-a");
      return yield* registry.state("/renderer/chosen/path").pipe(Effect.flip);
    })));
    expect(records.map(({ cwd }) => cwd)).toEqual(["/catalog/a", "/catalog/a-worktree"]);
    expect(result).toBeInstanceOf(SpaceRuntimeRegistryError);
    if (!(result instanceof SpaceRuntimeRegistryError)) throw new Error("Expected registry error");
    expect(result.reason).toBe("unknown_space");
  });

  it("evicts only the least-recently-used idle runtime", async () => {
    const records: OpenRecord[] = [];
    const stoppedWhileOpen = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const registry = yield* make({ snapshot: Effect.succeed(snapshot), runtimeFactory: fakeFactory(records), maxResident: 2 });
      yield* registry.state("space-a");
      yield* registry.state("space-b");
      yield* registry.state("space-a");
      yield* registry.state("space-c");
      return records.map(({ stopped }) => stopped);
    })));
    expect(records.slice(0, 3).map(({ cwd }) => cwd)).toEqual(["/catalog/a", "/catalog/b", "/catalog/c"]);
    expect(stoppedWhileOpen).toEqual([false, true, false]);
  });

  it("returns capacity instead of evicting streaming runtimes", async () => {
    const records: OpenRecord[] = [];
    const error = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const registry = yield* make({ snapshot: Effect.succeed(snapshot), runtimeFactory: fakeFactory(records), maxResident: 2 });
      yield* registry.state("space-a");
      yield* registry.state("space-b");
      if (records[0]) records[0].state = readyState({ isStreaming: true });
      if (records[1]) records[1].state = readyState({ isCompacting: true });
      return yield* registry.state("space-c").pipe(Effect.flip);
    })));
    expect(error).toBeInstanceOf(SpaceRuntimeRegistryError);
    if (!(error instanceof SpaceRuntimeRegistryError)) throw new Error("Expected registry error");
    expect(error.reason).toBe("capacity");
    expect(records).toHaveLength(2);
  });

  it("recreates an unused preview with creation-time depth before atomic model and prompt", async () => {
    const records: OpenRecord[] = [];
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const registry = yield* make({ snapshot: Effect.succeed(snapshot), runtimeFactory: fakeFactory(records) });
      yield* registry.availableModels("space-a");
      yield* registry.startSpace({ spaceId: "space-a", prompt: "Build it", model: { provider: "provider", id: "m" }, thinkingLevel: "high", rlmMaxDepth: 2 });
    })));
    expect(records.map(({ depth }) => depth)).toEqual([0, 2]);
    expect(records[0]?.stopped).toBe(true);
    expect(records[1]?.configured).toEqual([{ message: "Build it", model: { provider: "provider", id: "m" }, thinkingLevel: "high" }]);
  });
  it("replaces an idle used runtime when a new thread selects a different depth", async () => {
    const records: OpenRecord[] = [];
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const registry = yield* make({ snapshot: Effect.succeed(snapshot), runtimeFactory: fakeFactory(records) });
      yield* registry.state("space-a");
      if (records[0]) records[0].state = readyState({ messageCount: 3 });
      yield* registry.startSpace({ spaceId: "space-a", prompt: "New thread", model: { provider: "provider", id: "m" }, thinkingLevel: "off", rlmMaxDepth: 4 });
    })));
    expect(records.map(({ depth }) => depth)).toEqual([0, 4]);
    expect(records[0]?.stopped).toBe(true);
    expect(records[1]?.configured).toEqual([{ message: "New thread", model: { provider: "provider", id: "m" }, thinkingLevel: "off" }]);
  });

});
