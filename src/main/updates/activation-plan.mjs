import { readFile, lstat, readdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { exists } from "./activation-files.mjs"

function parsePath(path) {
  if (typeof path !== "string") throw new Error("Invalid release path")
  const invalidPart = path.split("/").some((part) => ["", ".", ".."].includes(part))
  const reserved = /^(\.git|\.zenbu|node_modules)(\/|$)/.test(path)
  if (invalidPart || reserved) throw new Error("Invalid release path")
  return path
}

function parsePaths(value) {
  if (!Array.isArray(value)) throw new Error("Invalid activation plan")
  return value.map(parsePath)
}

async function assertSourceDirectory(live, path, previous) {
  // Every descendant must belong to the old source tree, including empty
  // directories: a local directory is not permission to delete its contents.
  if (![...previous].some((entry) => entry.startsWith(`${path}/`))) throw new Error("Update conflicts with local data")
  for (const name of await readdir(join(live, path))) {
    const child = `${path}/${name}`
    const stat = await lstat(join(live, child))
    if (stat.isDirectory()) await assertSourceDirectory(live, child, previous)
    else if (!previous.has(child)) throw new Error("Update conflicts with local data")
  }
}

async function assertNoLocalConflicts(live, old, next) {
  const previous = new Set(old)
  for (const path of next) {
    const parts = path.split("/")
    let replacedAncestor = false
    for (let index = 1; index < parts.length; index++) {
      const ancestor = parts.slice(0, index).join("/")
      if (!await exists(join(live, ancestor))) break
      const stat = await lstat(join(live, ancestor))
      if (stat.isSymbolicLink()) throw new Error("Update conflicts with local data")
      if (!stat.isDirectory()) {
        if (!previous.has(ancestor)) throw new Error("Update conflicts with local data")
        replacedAncestor = true
        break
      }
    }
    if (replacedAncestor || !await exists(join(live, path))) continue
    const stat = await lstat(join(live, path))
    if (stat.isDirectory()) await assertSourceDirectory(live, path, previous)
    else if (!previous.has(path)) throw new Error("Update conflicts with local data")
  }
}

/** Refines the staged plan and rejects profile collisions before any source file moves. */
export async function readActivationPlan({ live, staged, backup }) {
  if (dirname(live) !== dirname(staged) || dirname(live) !== dirname(backup)) throw new Error("Update paths must be siblings")
  const raw = JSON.parse(await readFile(join(staged, ".ernie-update-tracked.json"), "utf8"))
  const old = parsePaths(raw?.old)
  const next = parsePaths(raw?.next)
  await assertNoLocalConflicts(live, old, next)
  // Git metadata and dependencies follow source; profile directories never move.
  return { old: [...old, ".git", "node_modules"], next: [...next, ".git", "node_modules"], dependencySignature: raw.dependencySignature }
}
