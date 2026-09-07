import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { createUpdateMirror } from "./fixtures/update-mirror"
import { zenbuSignature } from "./fixtures/zenbu-signature"
import { startUpdateWorker, waitForRelaunch } from "./fixtures/update-process"
// The activation worker is a standalone JavaScript entrypoint executed by bundled Electron's Node mode.
// @ts-expect-error JavaScript worker intentionally has no TypeScript runtime dependency.
import { activate } from "../main/updates/apply.mjs"

async function activationFixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "ernie-update-integration-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const live = join(root, "live"), staged = join(root, "staged"), backup = join(root, "backup")
  await mkdir(join(live, ".zenbu/db"), { recursive: true })
  await mkdir(staged)
  await writeFile(join(live, "old.ts"), "old source")
  await writeFile(join(live, ".zenbu/db/root.json"), "saved Agent")
  await writeFile(join(staged, "new.ts"), "new source")
  return { live, staged, backup }
}

test("source activation retains profile data and removes obsolete source", async (t) => {
  const paths = await activationFixture(t)
  await writeFile(join(paths.staged, ".ernie-update-tracked.json"), JSON.stringify({ old: ["old.ts"], next: ["new.ts"] }))
  await activate(paths)
  assert.equal(await readFile(join(paths.live, "new.ts"), "utf8"), "new source")
  await assert.rejects(access(join(paths.live, "old.ts")))
  assert.equal(await readFile(join(paths.backup, "old.ts"), "utf8"), "old source")
  assert.equal(await readFile(join(paths.live, ".zenbu/db/root.json"), "utf8"), "saved Agent")
})

test("source activation rejects a profile conflict without modifying source", async (t) => {
  const paths = await activationFixture(t)
  await writeFile(join(paths.staged, ".ernie-update-tracked.json"), JSON.stringify({ old: ["old.ts"], next: ["new.ts", ".zenbu/db/root.json"] }))
  await assert.rejects(activate(paths), /Invalid release path/)
  assert.equal(await readFile(join(paths.live, "old.ts"), "utf8"), "old source")
  assert.equal(await readFile(join(paths.live, ".zenbu/db/root.json"), "utf8"), "saved Agent")
})

test("publisher rejects unsafe destinations and overrides before spawning a publisher", async (t) => {
  const { spawnSync } = await import("node:child_process")
  const root = await mkdtemp(join(tmpdir(), "ernie-publish-integration-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, "package.json"), JSON.stringify({ version: "0.1.0", zenbu: { host: ">=0.1.0 <0.2.0" } }))
  const script = join(process.cwd(), "scripts/release.ts")
  for (const branch of ["main", "master"]) {
    await writeFile(join(root, "release.json"), JSON.stringify({ target: "thoriqakbar0/ernie", branch }))
    const result = spawnSync("nub", ["--node", script, "check"], { cwd: root, encoding: "utf8" })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /dedicated source distribution branch/)
  }
  await writeFile(join(root, "release.json"), JSON.stringify({ target: "thoriqakbar0/ernie", branch: "release" }))
  assert.equal(spawnSync("nub", ["--node", script, "check"], { cwd: root }).status, 0)
  assert.notEqual(spawnSync("nub", ["--node", script, "init", "--branch", "main"], { cwd: root }).status, 0)
})

test("source checks use a local Git HTTP server and reject incompatible or dirty installations", async (t) => {
  const { inspectRelease, assertInstallationUnchanged } = await import("../main/updates/source")
  const root = await mkdtemp(join(tmpdir(), "ernie-mirror-integration-"))
  t.after(() => rm(root, { recursive: true, force: true }))
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
  await writeFile(join(context.appsDir, "package.json"), "local edit")
  await assert.rejects(assertInstallationUnchanged(context, candidate), /local changes/)
  await commit("0.2.0", ">=0.2.0")
  await assert.rejects(inspectRelease(context), /newer Electron package/)
  const cancellation = new AbortController()
  cancellation.abort()
  await assert.rejects(inspectRelease(context, cancellation.signal))
})

test("activation rolls back moved source when a later path conflicts", async (t) => {
  const { symlink } = await import("node:fs/promises")
  const root = await mkdtemp(join(tmpdir(), "ernie-rollback-integration-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const live = join(root, "live"), staged = join(root, "staged"), backup = join(root, "backup")
  await mkdir(live); await mkdir(join(staged, "blocked"), { recursive: true }); await mkdir(join(root, "local"))
  await symlink(join(root, "local"), join(live, "blocked"))
  await writeFile(join(live, "old.ts"), "previous source")
  await writeFile(join(staged, "blocked/new.ts"), "next source")
  await writeFile(join(staged, ".ernie-update-tracked.json"), JSON.stringify({ old: ["old.ts"], next: ["blocked/new.ts"] }))
  await assert.rejects(activate({ live, staged, backup }), /conflicts/)
  assert.equal(await readFile(join(live, "old.ts"), "utf8"), "previous source")
  await assert.rejects(access(join(root, "local/new.ts")))
})

test("restart helper waits for the parent to exit before activating and relaunching", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "ernie-worker-integration-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const live = join(root, "live"), staged = join(root, "staged"), backup = join(root, "backup")
  await mkdir(live); await mkdir(staged)
  await writeFile(join(live, "app.txt"), "old")
  await writeFile(join(staged, "app.txt"), "new")
  await writeFile(join(staged, ".ernie-update-tracked.json"), JSON.stringify({ old: ["app.txt"], next: ["app.txt"] }))
  const { parent, done } = await startUpdateWorker(t, root, { live, staged, backup })
  assert.equal(await readFile(join(live, "app.txt"), "utf8"), "old")
  parent.kill()
  assert.equal(await done, 0)
  assert.equal(await readFile(join(live, "app.txt"), "utf8"), "new")
  assert.deepEqual(JSON.parse(await readFile(`${live}.update-result.json`, "utf8")), { outcome: "applied" })
  await waitForRelaunch(root)
})

test("prepared dependencies survive retry, but changed or removed installs invalidate the cache", async (t) => {
  const { PreparedDependencies } = await import("../main/updates/preparation")
  const root = await mkdtemp(join(tmpdir(), "ernie-prepared-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  let signature = "first", installs = 0, fail = false
  const cache = new PreparedDependencies()
  const port = {
    signature: async () => signature,
    installed: () => access(join(root, "node_modules")).then(() => true, () => false),
    install: async () => { installs++; if (fail) throw new Error("install failed"); await mkdir(join(root, "node_modules"), { recursive: true }) },
  }
  await cache.ensure(port); await cache.ensure(port)
  assert.equal(installs, 1, "cancel and retry do not reinstall prepared dependencies")
  signature = "changed"
  await cache.ensure(port)
  assert.equal(installs, 2)
  await rm(join(root, "node_modules"), { recursive: true })
  await cache.ensure(port)
  assert.equal(installs, 3)
  signature = "retry"; fail = true
  await assert.rejects(cache.ensure(port), /install failed/)
  fail = false
  await cache.ensure(port)
  assert.equal(installs, 5, "failed preparation must run again")
})

test("activation writes the final-path signature expected by the installed Zenbu launcher", async (t) => {
  // @ts-expect-error Node-only signature adapter is shared with the standalone restart helper.
  const { installedSignature } = await import("../main/updates/dependency-signature.mjs")
  const root = await mkdtemp(join(tmpdir(), "ernie-signature-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const live = join(root, "live"), staged = join(root, "staged"), backup = join(root, "backup")
  await mkdir(live); await mkdir(staged)
  const files = ["package.json", "pnpm-lock.yaml"]
  for (const file of files) { await writeFile(join(live, file), "previous"); await writeFile(join(staged, file), "next") }
  const pm = { type: "pnpm", version: "10.33.0" }
  const dependencySignature = await installedSignature(staged, live, pm, process.versions.electron ?? "no-electron")
  await writeFile(join(staged, ".ernie-update-tracked.json"), JSON.stringify({ old: files, next: files, dependencySignature }))
  await activate({ live, staged, backup })
  assert.equal(await readFile(join(live, ".zenbu/deps-sig"), "utf8"), await zenbuSignature(live, pm))
})
