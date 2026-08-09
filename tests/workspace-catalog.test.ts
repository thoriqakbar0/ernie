import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
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
    expect(result.refreshed.projects).toEqual([{
      id: root, path: root, label: "ernie", worktreeIds: [root, "/tmp/ernie-feature"],
    }]);
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
      id: "child-active", activeSessionId: "child-active", sessionId: "child-session", worktreeId: "/tmp/ernie-feature",
      parentAgentId: "root-active", childId: "sub-child", status: "working", runtimeKind: "subagent",
    });
    expect(result.events).toEqual([{ kind: "snapshot", snapshot: result.refreshed }]);
    expect(JSON.stringify(result.refreshed)).not.toMatch(/sessionFile|workerPid|spawnCode/u);
  });

  it("adds, archives, and restores user-opened project directories", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-projects-"));
    const selected = join(temporary, "second-project");
    const store = join(temporary, "projects.json");
    mkdirSync(selected);
    const normalizedSelected = realpathSync(selected);
    const catalogLayer = () => layer({
      repositoryPath: root, gitPath, nodePath: process.execPath, primeAgentCliPath,
      projectStorePath: store, refreshIntervalMs: false,
      environment: { ERNIE_FIXTURE_ROOT: root },
    });
    try {
      const added = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.addProject(selected);
      }).pipe(Effect.provide(catalogLayer())));
      expect(added.projects.map((project) => project.path)).toEqual([root, normalizedSelected]);
      expect(readFileSync(store, "utf8")).toBe(JSON.stringify({ version: 1, paths: [root, normalizedSelected] }, null, 2));

      const restored = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.refresh;
      }).pipe(Effect.provide(catalogLayer())));
      expect(restored.projects.map((project) => project.path)).toEqual([root, normalizedSelected]);

      const archived = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.archiveProject(normalizedSelected);
      }).pipe(Effect.provide(catalogLayer())));
      expect(archived.projects.map((project) => project.path)).toEqual([root]);
      expect(readFileSync(store, "utf8")).toBe(JSON.stringify({ version: 1, paths: [root] }, null, 2));

      const primaryError = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* Effect.flip(catalog.archiveProject(root));
      }).pipe(Effect.provide(catalogLayer())));
      expect(primaryError.message).toBe("Ernie's primary Space cannot be archived.");
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
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
        yield* Effect.sleep(1_000);
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

  it("preserves unusual worktree paths and excludes prunable records", async () => {
    const snapshot = await Effect.runPromise(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      return yield* catalog.refresh;
    }).pipe(Effect.provide(layer({
      repositoryPath: root,
      gitPath,
      nodePath: process.execPath,
      primeAgentCliPath,
      refreshIntervalMs: false,
      environment: { ERNIE_FIXTURE_ROOT: root, ERNIE_FIXTURE_NUL_EDGE: "1" },
    }))));

    expect(snapshot.worktrees).toEqual([{
      id: "/tmp/ernie feature\nline",
      path: "/tmp/ernie feature\nline",
      label: "feature/newline",
    }]);
    expect(snapshot.agents).toEqual([]);
  });

  it("returns a typed parse failure for malformed Git porcelain", async () => {
    const error = await Effect.runPromise(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      return yield* Effect.flip(catalog.refresh);
    }).pipe(Effect.provide(layer({
      repositoryPath: root,
      gitPath,
      nodePath: process.execPath,
      primeAgentCliPath,
      refreshIntervalMs: false,
      environment: { ERNIE_FIXTURE_ROOT: root, ERNIE_FIXTURE_MALFORMED_GIT: "1" },
    }))));

    expect(error).toBeInstanceOf(WorkspaceCatalogParseError);
    expect(error).toMatchObject({ _tag: "WorkspaceCatalogParseError", source: "git" });
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
