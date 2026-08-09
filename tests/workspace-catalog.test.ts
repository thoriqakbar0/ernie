import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { WorkspaceCatalog, WorkspaceCatalogParseError, WorkspaceCatalogWorktreeError, layer } from "../src/main/WorkspaceCatalog";

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


function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
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
      { id: root, path: root, label: "feat/worktree-workspace", branch: "feat/worktree-workspace", managed: false, checkoutPresent: true, locked: false },
      { id: "/tmp/ernie-feature", path: "/tmp/ernie-feature", label: "feature/child", branch: "feature/child", managed: false, checkoutPresent: true, locked: false, parentWorktreeId: root },
    ]);
    expect(result.refreshed.settledWorktrees).toEqual([]);
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

  it("settles a working linked checkout so the application can strictly close its runtime", async () => {
    const snapshot = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* WorkspaceCatalog;
      return yield* catalog.archiveWorktree("/tmp/ernie-feature");
    })));
    expect(snapshot.worktrees.some((worktree) => worktree.id === "/tmp/ernie-feature")).toBe(false);
    expect(snapshot.agents.some((agent) => agent.worktreeId === "/tmp/ernie-feature")).toBe(false);
    expect(snapshot.settledWorktrees?.find((worktree) => worktree.id === "/tmp/ernie-feature")).toMatchObject({
      projectId: root, branch: "feature/child", checkoutPresent: true,
    });
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
      expect(readFileSync(store, "utf8")).toBe(JSON.stringify({ version: 2, paths: [root, normalizedSelected], worktrees: [] }, null, 2));

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
      expect(readFileSync(store, "utf8")).toBe(JSON.stringify({ version: 2, paths: [root], worktrees: [] }, null, 2));

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
      branch: "feature/newline",
      managed: false,
      checkoutPresent: true,
      locked: false,
    }]);
    expect(snapshot.agents).toEqual([]);
  });

  it("creates from the authorized active HEAD and safely settles, restores, removes, and recreates a managed checkout", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-worktree-lifecycle-"));
    const repository = join(temporary, "repo");
    const sourceCheckout = join(temporary, "source");
    const store = join(temporary, "catalog.json");
    const managedRoot = join(temporary, "managed");
    mkdirSync(repository);
    git(repository, "init", "--initial-branch=main");
    git(repository, "config", "user.email", "ernie@example.invalid");
    git(repository, "config", "user.name", "Ernie Test");
    writeFileSync(join(repository, "README.md"), "main\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "initial");
    git(repository, "worktree", "add", "-b", "source", sourceCheckout, "HEAD");
    writeFileSync(join(sourceCheckout, "source.txt"), "source head\n");
    git(sourceCheckout, "add", "source.txt");
    git(sourceCheckout, "commit", "-m", "source commit");
    const sourceHead = git(sourceCheckout, "rev-parse", "HEAD");
    const catalogLayer = () => layer({
      repositoryPath: repository,
      nodePath: process.execPath,
      primeAgentCliPath,
      projectStorePath: store,
      managedWorktreeRoot: managedRoot,
      refreshIntervalMs: false,
      environment: { ERNIE_FIXTURE_ROOT: repository, ERNIE_FIXTURE_EMPTY: "1" },
    });
    try {
      const created = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.createWorktree(realpathSync(sourceCheckout), "feature/managed");
      }).pipe(Effect.provide(catalogLayer())));
      expect(realpathSync(created.worktreeId).startsWith(realpathSync(managedRoot))).toBe(true);
      expect(git(created.worktreeId, "rev-parse", "HEAD")).toBe(sourceHead);
      expect(git(created.worktreeId, "branch", "--show-current")).toBe("feature/managed");
      expect(created.snapshot.worktrees.find((worktree) => worktree.id === created.worktreeId)).toMatchObject({ managed: true, checkoutPresent: true });

      // Simulate a crash after Git succeeded but before Ernie persisted ownership.
      writeFileSync(store, JSON.stringify({ version: 2, paths: [], worktrees: [] }));
      const adopted = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.createWorktree(realpathSync(sourceCheckout), "feature/managed");
      }).pipe(Effect.provide(catalogLayer())));
      expect(adopted.worktreeId).toBe(created.worktreeId);
      expect(adopted.snapshot.worktrees.find((worktree) => worktree.id === created.worktreeId)).toMatchObject({
        branch: "feature/managed", managed: true, checkoutPresent: true,
      });

      const settled = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.archiveWorktree(created.worktreeId);
      }).pipe(Effect.provide(catalogLayer())));
      expect(settled.worktrees.some((worktree) => worktree.id === created.worktreeId)).toBe(false);
      expect(settled.settledWorktrees?.find((worktree) => worktree.id === created.worktreeId)).toMatchObject({
        projectId: repository, branch: "feature/managed", managed: true, checkoutPresent: true,
      });
      expect(existsSync(join(created.worktreeId, "source.txt"))).toBe(true);

      const restored = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.restoreWorktree(created.worktreeId);
      }).pipe(Effect.provide(catalogLayer())));
      expect(restored.worktrees.some((worktree) => worktree.id === created.worktreeId)).toBe(true);

      await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        yield* catalog.archiveWorktree(created.worktreeId);
      }).pipe(Effect.provide(catalogLayer())));
      const dirtyPath = join(created.worktreeId, "untracked.txt");
      writeFileSync(dirtyPath, "keep me\n");
      const dirtyError = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* Effect.flip(catalog.removeWorktreeCheckout(created.worktreeId));
      }).pipe(Effect.provide(catalogLayer())));
      expect(dirtyError).toBeInstanceOf(WorkspaceCatalogWorktreeError);
      expect(dirtyError).toMatchObject({ reason: "dirty_worktree" });
      expect(existsSync(created.worktreeId)).toBe(true);
      unlinkSync(dirtyPath);

      const removed = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.removeWorktreeCheckout(created.worktreeId);
      }).pipe(Effect.provide(catalogLayer())));
      expect(existsSync(created.worktreeId)).toBe(false);
      expect(git(repository, "show-ref", "--verify", "refs/heads/feature/managed")).toContain("refs/heads/feature/managed");
      expect(removed.settledWorktrees?.find((worktree) => worktree.id === created.worktreeId)).toMatchObject({ checkoutPresent: false });

      const recreated = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.restoreWorktree(created.worktreeId);
      }).pipe(Effect.provide(catalogLayer())));
      expect(existsSync(created.worktreeId)).toBe(true);
      expect(git(created.worktreeId, "branch", "--show-current")).toBe("feature/managed");
      expect(recreated.worktrees.some((worktree) => worktree.id === created.worktreeId)).toBe(true);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("retains managed and settled metadata when a Space is archived and reopened", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-worktree-space-reopen-"));
    const primary = join(temporary, "primary");
    const secondary = join(temporary, "secondary");
    const store = join(temporary, "catalog.json");
    const managedRoot = join(temporary, "managed");
    for (const repository of [primary, secondary]) {
      mkdirSync(repository);
      git(repository, "init", "--initial-branch=main");
      git(repository, "config", "user.email", "ernie@example.invalid");
      git(repository, "config", "user.name", "Ernie Test");
      writeFileSync(join(repository, "README.md"), `${repository}
`);
      git(repository, "add", "README.md");
      git(repository, "commit", "-m", "initial");
    }
    const catalogLayer = layer({
      repositoryPath: primary, nodePath: process.execPath, primeAgentCliPath,
      projectStorePath: store, managedWorktreeRoot: managedRoot, refreshIntervalMs: false,
      environment: { ERNIE_FIXTURE_ROOT: primary, ERNIE_FIXTURE_EMPTY: "1" },
    });
    try {
      const created = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        yield* catalog.addProject(secondary);
        return yield* catalog.createWorktree(realpathSync(secondary), "feature/reopen");
      }).pipe(Effect.provide(catalogLayer)));
      await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        yield* catalog.archiveWorktree(created.worktreeId);
        yield* catalog.removeWorktreeCheckout(created.worktreeId);
        yield* catalog.archiveProject(realpathSync(secondary));
      }).pipe(Effect.provide(catalogLayer)));
      const reopened = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* catalog.addProject(secondary);
      }).pipe(Effect.provide(catalogLayer)));
      expect(reopened.settledWorktrees?.find((worktree) => worktree.id === created.worktreeId)).toMatchObject({
        projectId: realpathSync(secondary), branch: "feature/reopen", managed: true, checkoutPresent: false,
      });
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it("refuses to recreate a tampered managed checkout path outside the managed root", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-worktree-tamper-"));
    const repository = join(temporary, "repo");
    const store = join(temporary, "catalog.json");
    const managedRoot = join(temporary, "managed");
    const outside = join(temporary, "outside", "checkout");
    mkdirSync(repository);
    git(repository, "init", "--initial-branch=main");
    git(repository, "config", "user.email", "ernie@example.invalid");
    git(repository, "config", "user.name", "Ernie Test");
    writeFileSync(join(repository, "README.md"), "main\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "initial");
    git(repository, "branch", "feature/tampered");
    writeFileSync(store, JSON.stringify({
      version: 2,
      paths: [repository],
      worktrees: [{
        projectId: repository, path: outside, branch: "feature/tampered", managed: true,
        lifecycle: "settled", settledAt: "2026-08-09T00:00:00.000Z",
      }],
    }));
    try {
      const error = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* Effect.flip(catalog.restoreWorktree(outside));
      }).pipe(Effect.provide(layer({
        repositoryPath: repository, nodePath: process.execPath, primeAgentCliPath,
        projectStorePath: store, managedWorktreeRoot: managedRoot, refreshIntervalMs: false,
        environment: { ERNIE_FIXTURE_ROOT: repository, ERNIE_FIXTURE_EMPTY: "1" },
      }))));
      expect(error).toBeInstanceOf(WorkspaceCatalogWorktreeError);
      expect(error).toMatchObject({ reason: "not_managed" });
      expect(existsSync(outside)).toBe(false);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it("refuses a managed restore whose saved parent resolves through a symlink outside the managed root", async () => {
    const temporary = mkdtempSync(join(tmpdir(), "ernie-worktree-symlink-"));
    const repository = join(temporary, "repo");
    const store = join(temporary, "catalog.json");
    const managedRoot = join(temporary, "managed");
    const outsideParent = join(temporary, "outside");
    const linkedParent = join(managedRoot, "linked");
    const checkout = join(linkedParent, "checkout");
    mkdirSync(repository); mkdirSync(managedRoot); mkdirSync(outsideParent);
    symlinkSync(outsideParent, linkedParent);
    git(repository, "init", "--initial-branch=main");
    git(repository, "config", "user.email", "ernie@example.invalid");
    git(repository, "config", "user.name", "Ernie Test");
    writeFileSync(join(repository, "README.md"), "main\n");
    git(repository, "add", "README.md"); git(repository, "commit", "-m", "initial"); git(repository, "branch", "feature/symlink");
    writeFileSync(store, JSON.stringify({ version: 2, paths: [repository], worktrees: [{
      projectId: repository, path: checkout, branch: "feature/symlink", managed: true,
      lifecycle: "settled", settledAt: "2026-08-09T00:00:00.000Z",
    }] }));
    try {
      const error = await Effect.runPromise(Effect.gen(function* () {
        const catalog = yield* WorkspaceCatalog;
        return yield* Effect.flip(catalog.restoreWorktree(checkout));
      }).pipe(Effect.provide(layer({
        repositoryPath: repository, nodePath: process.execPath, primeAgentCliPath,
        projectStorePath: store, managedWorktreeRoot: managedRoot, refreshIntervalMs: false,
        environment: { ERNIE_FIXTURE_ROOT: repository, ERNIE_FIXTURE_EMPTY: "1" },
      }))));
      expect(error).toBeInstanceOf(WorkspaceCatalogWorktreeError);
      expect(error).toMatchObject({ reason: "not_managed" });
      expect(existsSync(join(outsideParent, "checkout"))).toBe(false);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
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
