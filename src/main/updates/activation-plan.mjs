import { readFile } from "node:fs/promises"
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

async function assertNoLocalConflicts(live, old, next) {
  const previous = new Set(old)
  for (const path of next.filter((path) => !previous.has(path))) {
    if (await exists(join(live, path))) throw new Error("Update conflicts with local data")
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
  return { old: [...old, ".git", "node_modules"], next: [...next, ".git", "node_modules"] }
}
