import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import {
  DevServerCatalog,
  DevServerCommandError,
  DevServerConfigurationError,
  DevServerUnsupportedPlatformError,
  layer,
} from "../src/main/DevServerCatalog";

const fixturesPath = resolve(import.meta.dirname, "fixtures");
const lsofPath = resolve(fixturesPath, "dev-server-lsof.mjs");
const originalLog = process.env.ERNIE_LSOF_LOG;
const originalDelay = process.env.ERNIE_LSOF_DELAY_MS;

afterEach(() => {
  if (originalLog === undefined) delete process.env.ERNIE_LSOF_LOG;
  else process.env.ERNIE_LSOF_LOG = originalLog;
  if (originalDelay === undefined) delete process.env.ERNIE_LSOF_DELAY_MS;
  else process.env.ERNIE_LSOF_DELAY_MS = originalDelay;
});

function provideCatalog<A, E>(effect: Effect.Effect<A, E, DevServerCatalog>, options = {}) {
  return effect.pipe(Effect.provide(layer({ lsofPath, platform: "darwin", ...options })));
}

describe("DevServerCatalog", () => {
  it("reports only allowlisted listeners whose process cwd is inside the selected worktree", async () => {
    const result = await Effect.runPromise(provideCatalog(Effect.scoped(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      const events: unknown[] = [];
      yield* Effect.forkScoped(Stream.runForEach(catalog.events, (event) => Effect.sync(() => { events.push(event); })));
      const snapshot = yield* catalog.refresh(fixturesPath);
      yield* Effect.yieldNow;
      return { snapshot, current: yield* catalog.current, events };
    }))));

    expect(result.snapshot).toEqual(result.current);
    expect(result.snapshot.revision).toBe(1);
    expect(result.snapshot.updatedAt).not.toBe(new Date(0).toISOString());
    expect(result.snapshot.servers).toEqual([
      { port: 3000, url: "http://[::1]:3000" },
      { port: 5173, url: "http://127.0.0.1:5173" },
      { port: 8080, url: "http://127.0.0.1:8080" },
    ]);
    expect(result.events).toEqual([{ kind: "snapshot", snapshot: result.snapshot }]);
    expect(JSON.stringify(result)).not.toMatch(/pid|process|command|\/Users\/|\/tmp\//iu);
  });

  it("does not attribute listeners when the selected worktree does not contain their cwd", async () => {
    const worktree = await mkdtemp(join(tmpdir(), "ernie-worktree-"));
    try {
      const snapshot = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
        const catalog = yield* DevServerCatalog;
        return yield* catalog.refresh(worktree);
      })));
      expect(snapshot.servers).toEqual([]);
    } finally {
      await rm(worktree, { recursive: true, force: true });
    }
  });

  it("applies the bounded known-port allowlist even to in-scope listeners", async () => {
    const snapshot = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      return yield* catalog.refresh(fixturesPath);
    }), { commonPorts: [5173, 9000] }));
    expect(snapshot.servers).toEqual([
      { port: 5173, url: "http://127.0.0.1:5173" },
      { port: 9000, url: "http://127.0.0.1:9000" },
    ]);
  });

  it("executes each refresh immediately when its returned Effect is run", async () => {
    const result = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      const before = yield* catalog.current;
      const first = yield* catalog.refresh(fixturesPath);
      const second = yield* catalog.refresh(fixturesPath);
      return { before, first, second };
    })));
    expect(result.before.revision).toBe(0);
    expect(result.first.revision).toBe(1);
    expect(result.second.revision).toBe(2);
  });

  it("serializes concurrent refresh discovery and publication", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ernie-lsof-log-"));
    const logPath = join(directory, "calls.log");
    process.env.ERNIE_LSOF_LOG = logPath;
    process.env.ERNIE_LSOF_DELAY_MS = "75";
    try {
      const snapshots = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
        const catalog = yield* DevServerCatalog;
        return yield* Effect.all([
          catalog.refresh(fixturesPath),
          catalog.refresh(fixturesPath),
        ], { concurrency: "unbounded" });
      })));
      expect(snapshots.map(({ revision }) => revision).sort()).toEqual([1, 2]);
      expect(await readFile(logPath, "utf8")).toBe("start\nend\nstart\nend\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("treats lsof's no-listener exit status as an empty snapshot", async () => {
    const snapshot = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      return yield* catalog.refresh(fixturesPath);
    }), { lsofPath: resolve(fixturesPath, "dev-server-lsof-empty.mjs") }));
    expect(snapshot.servers).toEqual([]);
  });

  it("does not use an unscoped fallback when lsof is missing or fails", async () => {
    for (const executable of ["does-not-exist-lsof", "dev-server-lsof-error.mjs"]) {
      const error = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
        const catalog = yield* DevServerCatalog;
        return yield* Effect.flip(catalog.refresh(fixturesPath));
      }), { lsofPath: resolve(fixturesPath, executable) }));
      expect(error).toBeInstanceOf(DevServerCommandError);
    }
  });

  it("preserves typed errors for unsupported platforms and invalid scope configuration", async () => {
    const unsupported = await Effect.runPromise(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      return yield* Effect.flip(catalog.refresh(fixturesPath));
    }).pipe(Effect.provide(layer({ platform: "win32" }))));
    expect(unsupported).toBeInstanceOf(DevServerUnsupportedPlatformError);

    const unbounded = await Effect.runPromise(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      return yield* Effect.flip(catalog.refresh(fixturesPath));
    }).pipe(Effect.provide(layer({
      platform: "linux",
      lsofPath,
      commonPorts: Array.from({ length: 33 }, (_, index) => index + 1),
    }))));
    expect(unbounded).toBeInstanceOf(DevServerConfigurationError);

    const unknownScope = await Effect.runPromise(provideCatalog(Effect.gen(function* () {
      const catalog = yield* DevServerCatalog;
      return yield* Effect.flip(catalog.refresh(resolve(fixturesPath, "missing-worktree")));
    })));
    expect(unknownScope).toBeInstanceOf(DevServerConfigurationError);
  });
});
