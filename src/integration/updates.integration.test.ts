import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { TestContext } from "node:test"
import { createUpdateMirror } from "./fixtures/update-mirror"
import { zenbuSignature } from "./fixtures/zenbu-signature"
import { startUpdateWorker, waitForRelaunch } from "./fixtures/update-process"
// The activation worker is a standalone JavaScript entrypoint executed by bundled Electron's Node mode.
// @ts-expect-error JavaScript worker intentionally has no TypeScript runtime dependency.
import { activate } from "../main/updates/apply.mjs"

const activationFixture = async (t: TestContext) => {
  const root = await mkdtemp(path.join(tmpdir(), "ernie-update-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const live = path.join(root, "live")
  const staged = path.join(root, "staged")
  const backup = path.join(root, "backup")
  await mkdir(path.join(live, ".zenbu/db"), { recursive: true })
  await mkdir(staged)
  await writeFile(path.join(live, "old.ts"), "old source")
  await writeFile(path.join(live, ".zenbu/db/root.json"), "saved Agent")
  await writeFile(path.join(staged, "new.ts"), "new source")
  return { backup, live, staged }
}

test("source activation retains profile data and removes obsolete source", async (t) => {
  const paths = await activationFixture(t)
  await writeFile(
    path.join(paths.staged, ".ernie-update-tracked.json"),
    JSON.stringify({ next: ["new.ts"], old: ["old.ts"] }),
  )
  await activate(paths)
  assert.equal(await readFile(path.join(paths.live, "new.ts"), "utf-8"), "new source")
  await assert.rejects(access(path.join(paths.live, "old.ts")))
  assert.equal(await readFile(path.join(paths.backup, "old.ts"), "utf-8"), "old source")
  assert.equal(await readFile(path.join(paths.live, ".zenbu/db/root.json"), "utf-8"), "saved Agent")
})

test("source activation rejects a profile conflict without modifying source", async (t) => {
  const paths = await activationFixture(t)
  await writeFile(
    path.join(paths.staged, ".ernie-update-tracked.json"),
    JSON.stringify({ next: ["new.ts", ".zenbu/db/root.json"], old: ["old.ts"] }),
  )
  await assert.rejects(activate(paths), /Invalid release path/u)
  assert.equal(await readFile(path.join(paths.live, "old.ts"), "utf-8"), "old source")
  assert.equal(await readFile(path.join(paths.live, ".zenbu/db/root.json"), "utf-8"), "saved Agent")
})

test("publisher rejects unsafe destinations and overrides before spawning a publisher", async (t) => {
  const { spawnSync } = await import("node:child_process")
  const root = await mkdtemp(path.join(tmpdir(), "ernie-publish-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "ernie", version: "0.1.0", zenbu: { host: ">=0.1.0 <0.2.0" } }),
  )
  await writeFile(
    path.join(root, "electron-builder.json"),
    JSON.stringify({ appId: "dev.zenbu.ernie", productName: "Ernie" }),
  )
  const script = path.join(process.cwd(), "scripts/release.ts")
  const assertUnsafeBranch = async (branch: string) => {
    await writeFile(
      path.join(root, "release.json"),
      JSON.stringify({ branch, target: "thoriqakbar0/ernie" }),
    )
    const result = spawnSync("nub", ["--node", script, "check"], { cwd: root, encoding: "utf-8" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dedicated source distribution branch/u)
  }
  await assertUnsafeBranch("main")
  await assertUnsafeBranch("master")
  await writeFile(
    path.join(root, "release.json"),
    JSON.stringify({ branch: "release", target: "thoriqakbar0/ernie" }),
  )
  assert.equal(spawnSync("nub", ["--node", script, "check"], { cwd: root }).status, 0)
  assert.notEqual(
    spawnSync("nub", ["--node", script, "init", "--branch", "main"], { cwd: root }).status,
    0,
  )
})

test("source checks use a local Git HTTP server and reject incompatible or dirty installations", async (t) => {
  const { inspectRelease, assertInstallationUnchanged } = await import("../main/updates/source")
  const root = await mkdtemp(path.join(tmpdir(), "ernie-mirror-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const { context, commit, head, requests } = await createUpdateMirror(t, root)
  assert.equal(await inspectRelease(context), null)
  assert.deepEqual(requests, ["GET"], "unchanged checks must not download a Git pack")
  await commit("0.1.1", ">=0.1.0 <0.2.0")
  const candidate = await inspectRelease(context)
  assert.ok(candidate)
  assert.equal(candidate.version, "0.1.1")
  requests.length = 0
  assert.equal(await inspectRelease(context, undefined, candidate), candidate)
  assert.deepEqual(requests, ["GET"], "an available revision reuses its existing staging directory")
  assert.equal(head(), candidate.currentRevision)
  await assertInstallationUnchanged(context, candidate)
  await writeFile(
    path.join(candidate.directory, ".ernie-update-tracked.json"),
    "previous restart plan",
  )
  assert.equal(
    await inspectRelease(context, undefined, candidate),
    candidate,
    "cancelled shutdown retains prepared source",
  )
  await assertInstallationUnchanged(
    { ...context, appsDir: candidate.directory },
    { ...candidate, currentRevision: candidate.revision },
  )
  await writeFile(path.join(context.appsDir, "package.json"), "local edit")
  await assert.rejects(assertInstallationUnchanged(context, candidate), /local changes/u)
  await commit("0.2.0", ">=0.2.0")
  await assert.rejects(inspectRelease(context), /newer Electron package/u)
  const cancellation = new AbortController()
  cancellation.abort()
  await assert.rejects(inspectRelease(context, cancellation.signal))
})

test("activation rolls back moved source when a later path conflicts", async (t) => {
  const { symlink } = await import("node:fs/promises")
  const root = await mkdtemp(path.join(tmpdir(), "ernie-rollback-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const live = path.join(root, "live")
  const staged = path.join(root, "staged")
  const backup = path.join(root, "backup")
  await mkdir(live)
  await mkdir(path.join(staged, "blocked"), { recursive: true })
  await mkdir(path.join(root, "local"))
  await symlink(path.join(root, "local"), path.join(live, "blocked"))
  await writeFile(path.join(live, "old.ts"), "previous source")
  await writeFile(path.join(staged, "blocked/new.ts"), "next source")
  await writeFile(
    path.join(staged, ".ernie-update-tracked.json"),
    JSON.stringify({ next: ["blocked/new.ts"], old: ["old.ts"] }),
  )
  await assert.rejects(activate({ backup, live, staged }), /conflicts/u)
  assert.equal(await readFile(path.join(live, "old.ts"), "utf-8"), "previous source")
  await assert.rejects(access(path.join(root, "local/new.ts")))
})

test("restart helper waits for the parent to exit before activating and relaunching", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "ernie-worker-integration-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const live = path.join(root, "live")
  const staged = path.join(root, "staged")
  const backup = path.join(root, "backup")
  await mkdir(live)
  await mkdir(staged)
  await writeFile(path.join(live, "app.txt"), "old")
  await writeFile(path.join(staged, "app.txt"), "new")
  await writeFile(
    path.join(staged, ".ernie-update-tracked.json"),
    JSON.stringify({ next: ["app.txt"], old: ["app.txt"] }),
  )
  const { parent, done } = await startUpdateWorker(t, root, { backup, live, staged })
  assert.equal(await readFile(path.join(live, "app.txt"), "utf-8"), "old")
  parent.kill()
  assert.equal(await done, 0)
  assert.equal(await readFile(path.join(live, "app.txt"), "utf-8"), "new")
  assert.deepEqual(JSON.parse(await readFile(`${live}.update-result.json`, "utf-8")), {
    outcome: "applied",
  })
  await waitForRelaunch(root)
})

test("restart helper relaunches even when its result marker cannot be written", async (t) => {
  const paths = await activationFixture(t)
  const root = path.join(paths.live, "..")
  await mkdir(`${paths.live}.update-result.json`)
  await writeFile(
    path.join(paths.staged, ".ernie-update-tracked.json"),
    JSON.stringify({ next: ["new.ts"], old: ["old.ts"] }),
  )
  const { parent, done } = await startUpdateWorker(t, root, paths)
  parent.kill()
  assert.equal(await done, 1, "reporting failure remains observable")
  await waitForRelaunch(root)
  assert.equal(await readFile(path.join(paths.live, "new.ts"), "utf-8"), "new source")
  assert.equal(await readFile(path.join(paths.live, ".zenbu/db/root.json"), "utf-8"), "saved Agent")
})

test(
  "cancelled shutdown times out without activating or relaunching",
  { timeout: 40_000 },
  async (t) => {
    const paths = await activationFixture(t)
    const root = path.join(paths.live, "..")
    await writeFile(
      path.join(paths.staged, ".ernie-update-tracked.json"),
      JSON.stringify({ next: ["new.ts"], old: ["old.ts"] }),
    )
    const { done } = await startUpdateWorker(t, root, paths)
    assert.equal(await done, 1)
    assert.equal(await readFile(path.join(paths.live, "old.ts"), "utf-8"), "old source")
    assert.equal(await readFile(path.join(paths.staged, "new.ts"), "utf-8"), "new source")
    await Promise.all(
      [paths.backup, `${paths.live}.update-result.json`, path.join(root, "restarted")].map((file) =>
        assert.rejects(access(file)),
      ),
    )
  },
)

test("prepared dependencies survive retry, but changed or removed installs invalidate the cache", async (t) => {
  const { PreparedDependencies } = await import("../main/updates/preparation")
  const root = await mkdtemp(path.join(tmpdir(), "ernie-prepared-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  let fail = false
  let installs = 0
  let signature = "first"
  const cache = new PreparedDependencies()
  const port = {
    install: async () => {
      installs += 1
      if (fail) {
        throw new Error("install failed")
      }
      await mkdir(path.join(root, "node_modules"), { recursive: true })
    },
    installed: () =>
      access(path.join(root, "node_modules")).then(
        () => true,
        () => false,
      ),
    signature: () => Promise.resolve(signature),
  }
  await cache.ensure(port)
  await cache.ensure(port)
  assert.equal(installs, 1, "cancel and retry do not reinstall prepared dependencies")
  signature = "changed"
  await cache.ensure(port)
  assert.equal(installs, 2)
  await rm(path.join(root, "node_modules"), { recursive: true })
  await cache.ensure(port)
  assert.equal(installs, 3)
  signature = "retry"
  fail = true
  await assert.rejects(cache.ensure(port), /install failed/u)
  fail = false
  await cache.ensure(port)
  assert.equal(installs, 5, "failed preparation must run again")
})

test("activation writes the final-path signature expected by the installed Zenbu launcher", async (t) => {
  // @ts-expect-error Node-only signature adapter is shared with the standalone restart helper.
  const { installedSignature } = await import("../main/updates/dependency-signature.mjs")
  const root = await mkdtemp(path.join(tmpdir(), "ernie-signature-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const live = path.join(root, "live")
  const staged = path.join(root, "staged")
  const backup = path.join(root, "backup")
  await mkdir(live)
  await mkdir(staged)
  const files = ["package.json", "pnpm-lock.yaml"]
  await Promise.all(
    files.map(async (file) => {
      await writeFile(path.join(live, file), "previous")
      await writeFile(path.join(staged, file), "next")
    }),
  )
  const pm = { type: "pnpm", version: "10.33.0" }
  const dependencySignature = await installedSignature(
    staged,
    live,
    pm,
    process.versions.electron ?? "no-electron",
  )
  await writeFile(
    path.join(staged, ".ernie-update-tracked.json"),
    JSON.stringify({ dependencySignature, next: files, old: files }),
  )
  await activate({ backup, live, staged })
  assert.equal(
    await readFile(path.join(live, ".zenbu/deps-sig"), "utf-8"),
    await zenbuSignature(live, pm),
  )
})
