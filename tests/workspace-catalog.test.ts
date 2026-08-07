import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { WorkspaceCatalog, WorkspaceCatalogParseError, layer } from "../src/main/WorkspaceCatalog";

const root = resolve(import.meta.dirname, "..");
const gitPath = resolve(import.meta.dirname, "fixtures/workspace-git.mjs");
const primeAgentCliPath = resolve(import.meta.dirname, "fixtures/workspace-prime-agent.mjs");

function provideCatalog<A, E>(effect: Effect.Effect<A, E, WorkspaceCatalog>, malformed = false) {
  return effect.pipe(Effect.provide(layer({
    repositoryPath: root,
    gitPath,
    nodePath: process.execPath,
    primeAgentCliPath,
    refreshIntervalMs: false,
    environment: {
      ERNIE_FIXTURE_ROOT: root,
      ...(malformed ? { ERNIE_FIXTURE_MALFORMED: "1" } : {}),
    },
  })));
}

describe("WorkspaceCatalog", () => {
  it("joins only repository worktrees and sessions into renderer-safe parent relationships", async () => {
    const result = await Effect.runPromise(provideCatalog(Effect.scoped(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      const events: unknown[] = [];
      yield* Effect.forkScoped(Stream.runForEach(catalog.events, (event) => Effect.sync(() => { events.push(event); })));
      const refreshed = yield* catalog.refresh;
      yield* Effect.yieldNow;
      return { refreshed, current: yield* catalog.current, events };
    }))));

    expect(result.refreshed).toEqual(result.current);
    expect(result.refreshed.worktrees).toEqual([
      { id: root, path: root, label: "feat/worktree-workspace" },
      { id: "/tmp/ernie-feature", path: "/tmp/ernie-feature", label: "feature/child", parentWorktreeId: root },
    ]);
    expect(result.refreshed.agents).toHaveLength(2);
    expect(result.refreshed.agents[0]).toMatchObject({
      id: "root-active", sessionId: "root-session", worktreeId: root,
      name: "Root", status: "waiting", runtimeKind: "root",
    });
    expect(result.refreshed.agents[1]).toMatchObject({
      id: "child-session", sessionId: "child-session", worktreeId: "/tmp/ernie-feature",
      parentAgentId: "root-active", childId: "sub-child", status: "working", runtimeKind: "subagent",
    });
    expect(result.events).toEqual([{ kind: "snapshot", snapshot: result.refreshed }]);
    expect(JSON.stringify(result.refreshed)).not.toMatch(/sessionFile|workerPid|spawnCode/u);
  });

  it("starts with one refresh when polling is disabled", async () => {
    const snapshot = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      yield* catalog.start;
      return yield* catalog.current;
    })));
    expect(snapshot.agents).toHaveLength(2);
  });

  it("recovers when the first polling refresh fails", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-catalog-retry-"));
    const failOnceFile = join(temporary, "failed-once");
    try {
      const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        const events: Array<{ readonly kind: string; readonly message?: string }> = [];
        yield* Effect.forkScoped(Stream.runForEach(catalog.events, (event) => Effect.sync(() => { events.push(event); })));
        yield* Effect.yieldNow;
        yield* Effect.forkScoped(catalog.start);
        yield* Effect.sleep(350);
        return { snapshot: yield* catalog.current, events };
      })).pipe(Effect.provide(layer({
        repositoryPath: root, gitPath, nodePath: process.execPath, primeAgentCliPath,
        refreshIntervalMs: 10,
        environment: { ERNIE_FIXTURE_ROOT: root, ERNIE_FIXTURE_FAIL_ONCE_FILE: failOnceFile },
      }))));
      expect(result.snapshot.agents).toHaveLength(2);
      expect(result.events).toContainEqual({ kind: "error", message: "Unable to refresh the workspace." });
      expect(result.events.some((event) => event.kind === "snapshot")).toBe(true);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("returns a typed parse failure for malformed Prime Agent JSON", async () => {
    const error = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      return yield* Effect.flip(catalog.refresh);
    }), true));
    expect(error).toBeInstanceOf(WorkspaceCatalogParseError);
    expect(error).toMatchObject({ _tag: "WorkspaceCatalogParseError", source: "prime-agent" });
  });
});
