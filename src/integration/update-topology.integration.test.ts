import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"
import type { TestContext } from "node:test"
// @ts-expect-error Standalone helper also runs outside the TypeScript runtime.
import { activate } from "../main/updates/activation.mjs"

const fixture = async (t: TestContext, old: string, next: string, fail = false) => {
  const root = await mkdtemp(path.join(tmpdir(), "ernie-topology-"))
  t.after(() => rm(root, { force: true, recursive: true }))
  const paths = {
    backup: path.join(root, "backup"),
    live: path.join(root, "live"),
    staged: path.join(root, "staged"),
  }
  await Promise.all(
    [
      [paths.live, old, "old"],
      [paths.staged, next, "new"],
    ].map(async ([directory, file, content]) => {
      await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
      await writeFile(path.join(directory, file), content)
    }),
  )
  await writeFile(
    path.join(paths.staged, ".ernie-update-tracked.json"),
    JSON.stringify({
      next: [next],
      old: [old],
      ...(fail ? { dependencySignature: "invalid" } : {}),
    }),
  )
  return paths
}

for (const [old, next] of [
  ["module", "module/nested/index.js"],
  ["module/nested/index.js", "module"],
]) {
  test(`activation supports ${old} -> ${next}`, async (t) => {
    const paths = await fixture(t, old, next)
    await activate(paths)
    assert.equal(await readFile(path.join(paths.live, next), "utf-8"), "new")
    assert.equal(await readFile(path.join(paths.backup, old), "utf-8"), "old")
  })
  test(`rollback restores ${old} after replacing it with ${next}`, async (t) => {
    const paths = await fixture(t, old, next, true)
    await assert.rejects(activate(paths), /Invalid dependency signature/u)
    assert.equal(await readFile(path.join(paths.live, old), "utf-8"), "old")
    assert.equal(await readFile(path.join(paths.staged, next), "utf-8"), "new")
  })
}

test("directory replacement preserves untracked descendants and rejects before moving", async (t) => {
  const paths = await fixture(t, "module/index.js", "module")
  await writeFile(path.join(paths.live, "module/notes.txt"), "user content")
  await assert.rejects(activate(paths), /conflicts with local data/u)
  assert.equal(await readFile(path.join(paths.live, "module/notes.txt"), "utf-8"), "user content")
  assert.equal(await readFile(path.join(paths.live, "module/index.js"), "utf-8"), "old")
  await assert.rejects(access(paths.backup))
})

test("directory replacement preserves untracked empty directories", async (t) => {
  const paths = await fixture(t, "module/index.js", "module")
  await mkdir(path.join(paths.live, "module/local"))
  await assert.rejects(activate(paths), /conflicts with local data/u)
  await access(path.join(paths.live, "module/local"))
})

test("activation rejects symlinked destination parents without touching their target", async (t) => {
  const paths = await fixture(t, "old.js", "linked/new.js")
  const local = path.join(path.dirname(paths.live), "local")
  await mkdir(local)
  await symlink(local, path.join(paths.live, "linked"))
  await assert.rejects(activate(paths), /conflicts with local data/u)
  assert.equal(await readFile(path.join(paths.live, "old.js"), "utf-8"), "old")
  await assert.rejects(access(path.join(local, "new.js")))
})

test("failed incoming move removes empty parents before restoring the old file", async (t) => {
  if (process.getuid?.() === 0) {
    t.skip("Root bypasses directory write permissions")
    return
  }
  const paths = await fixture(t, "module", "module/nested/index.js")
  const protectedDirectory = path.join(paths.staged, "module/nested")
  await chmod(protectedDirectory, 0o555)
  try {
    await assert.rejects(activate(paths), /EACCES|EPERM/u)
    assert.equal(await readFile(path.join(paths.live, "module"), "utf-8"), "old")
    assert.equal(await readFile(path.join(paths.staged, "module/nested/index.js"), "utf-8"), "new")
  } finally {
    await chmod(protectedDirectory, 0o755)
  }
})
