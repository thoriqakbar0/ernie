import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import test, { type TestContext } from "node:test"
// @ts-expect-error Standalone helper also runs outside the TypeScript runtime.
import { activate } from "../main/updates/activation.mjs"

async function fixture(t: TestContext, old: string, next: string, fail = false) {
  const root = await mkdtemp(join(tmpdir(), "ernie-topology-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const paths = { live: join(root, "live"), staged: join(root, "staged"), backup: join(root, "backup") }
  for (const [directory, path, content] of [[paths.live, old, "old"], [paths.staged, next, "new"]]) {
    await mkdir(dirname(join(directory, path)), { recursive: true })
    await writeFile(join(directory, path), content)
  }
  await writeFile(join(paths.staged, ".ernie-update-tracked.json"), JSON.stringify({ old: [old], next: [next], ...(fail ? { dependencySignature: "invalid" } : {}) }))
  return paths
}

for (const [old, next] of [["module", "module/nested/index.js"], ["module/nested/index.js", "module"]]) {
  test(`activation supports ${old} -> ${next}`, async (t) => {
    const paths = await fixture(t, old, next)
    await activate(paths)
    assert.equal(await readFile(join(paths.live, next), "utf8"), "new")
    assert.equal(await readFile(join(paths.backup, old), "utf8"), "old")
  })
  test(`rollback restores ${old} after replacing it with ${next}`, async (t) => {
    const paths = await fixture(t, old, next, true)
    await assert.rejects(activate(paths), /Invalid dependency signature/)
    assert.equal(await readFile(join(paths.live, old), "utf8"), "old")
    assert.equal(await readFile(join(paths.staged, next), "utf8"), "new")
  })
}

test("directory replacement preserves untracked descendants and rejects before moving", async (t) => {
  const paths = await fixture(t, "module/index.js", "module")
  await writeFile(join(paths.live, "module/notes.txt"), "user content")
  await assert.rejects(activate(paths), /conflicts with local data/)
  assert.equal(await readFile(join(paths.live, "module/notes.txt"), "utf8"), "user content")
  assert.equal(await readFile(join(paths.live, "module/index.js"), "utf8"), "old")
  await assert.rejects(access(paths.backup))
})

test("directory replacement preserves untracked empty directories", async (t) => {
  const paths = await fixture(t, "module/index.js", "module")
  await mkdir(join(paths.live, "module/local"))
  await assert.rejects(activate(paths), /conflicts with local data/)
  await access(join(paths.live, "module/local"))
})

test("activation rejects symlinked destination parents without touching their target", async (t) => {
  const paths = await fixture(t, "old.js", "linked/new.js")
  const local = join(dirname(paths.live), "local")
  await mkdir(local)
  await symlink(local, join(paths.live, "linked"))
  await assert.rejects(activate(paths), /conflicts with local data/)
  assert.equal(await readFile(join(paths.live, "old.js"), "utf8"), "old")
  await assert.rejects(access(join(local, "new.js")))
})
