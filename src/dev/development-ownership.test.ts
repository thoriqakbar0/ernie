import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { acquireDevelopmentOwnership } from "../../scripts/dev/ownership.ts"

test("one development profile has one live owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ernie-owner-test-"))
  const filePath = join(directory, "owner.json")
  try {
    const first = await acquireDevelopmentOwnership(filePath, "first")
    await assert.rejects(() => acquireDevelopmentOwnership(filePath, "second"))
    await first.release()
    const second = await acquireDevelopmentOwnership(filePath, "second")
    await second.release()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("a stale development owner is reclaimed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ernie-owner-stale-test-"))
  const filePath = join(directory, "owner.json")
  try {
    await writeFile(filePath, JSON.stringify({ generation: "stale", pid: 2_147_483_647 }))
    const ownership = await acquireDevelopmentOwnership(filePath, "current")
    await ownership.release()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("concurrent stale-owner reclamation admits only one supervisor", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ernie-owner-race-"))
  const ownerFile = join(directory, "owner.json")
  await writeFile(ownerFile, `${JSON.stringify({ generation: "stale", pid: 999_999_999 })}\n`)

  try {
    const results = await Promise.allSettled([
      acquireDevelopmentOwnership(ownerFile, "first"),
      acquireDevelopmentOwnership(ownerFile, "second"),
    ])
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    const rejected = results.filter((result) => result.status === "rejected")
    assert.equal(fulfilled.length, 1)
    assert.equal(rejected.length, 1)
    if (fulfilled[0]?.status === "fulfilled") await fulfilled[0].value.release()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
