import { readFile, lstat, readdir } from "node:fs/promises"
import nodePath from "node:path"
import { exists } from "./activation-files.mjs"

const parsePath = (path) => {
  if (typeof path !== "string") {
    throw new TypeError("Invalid release path")
  }
  const invalidPart = path.split("/").some((part) => ["", ".", ".."].includes(part))
  const reserved = /^(?:\.git|\.zenbu|node_modules)(?:\/|$)/u.test(path)
  if (invalidPart || reserved) {
    throw new Error("Invalid release path")
  }
  return path
}

const parsePaths = (value) => {
  if (!Array.isArray(value)) {
    throw new TypeError("Invalid activation plan")
  }
  return value.map(parsePath)
}

const assertSourceDirectory = async (live, path, previous) => {
  // Every descendant must belong to the old source tree, including empty
  // directories: a local directory is not permission to delete its contents.
  if (![...previous].some((entry) => entry.startsWith(`${path}/`))) {
    throw new Error("Update conflicts with local data")
  }
  const names = await readdir(nodePath.join(live, path))
  await Array.fromAsync(names, async (name) => {
    const child = `${path}/${name}`
    const stat = await lstat(nodePath.join(live, child))
    if (stat.isDirectory()) {
      await assertSourceDirectory(live, child, previous)
    } else if (!previous.has(child)) {
      throw new Error("Update conflicts with local data")
    }
  })
}

const assertNoLocalConflicts = async (live, old, next) => {
  const previous = new Set(old)
  await Array.fromAsync(next, async (path) => {
    const parts = path.split("/")
    const hasReplacedAncestor = async (index) => {
      if (index >= parts.length) {
        return false
      }
      const ancestor = parts.slice(0, index).join("/")
      if (!(await exists(nodePath.join(live, ancestor)))) {
        return false
      }
      const stat = await lstat(nodePath.join(live, ancestor))
      if (stat.isSymbolicLink()) {
        throw new Error("Update conflicts with local data")
      }
      if (!stat.isDirectory()) {
        if (!previous.has(ancestor)) {
          throw new Error("Update conflicts with local data")
        }
        return true
      }
      return hasReplacedAncestor(index + 1)
    }
    const replacedAncestor = await hasReplacedAncestor(1)
    if (replacedAncestor || !(await exists(nodePath.join(live, path)))) {
      return
    }
    const stat = await lstat(nodePath.join(live, path))
    if (stat.isDirectory()) {
      await assertSourceDirectory(live, path, previous)
    } else if (!previous.has(path)) {
      throw new Error("Update conflicts with local data")
    }
  })
}

/** Refines the staged plan and rejects profile collisions before any source file moves. */
export const readActivationPlan = async ({ live, staged, backup }) => {
  if (
    nodePath.dirname(live) !== nodePath.dirname(staged) ||
    nodePath.dirname(live) !== nodePath.dirname(backup)
  ) {
    throw new Error("Update paths must be siblings")
  }
  const raw = JSON.parse(
    await readFile(nodePath.join(staged, ".ernie-update-tracked.json"), "utf-8"),
  )
  const old = parsePaths(raw?.old)
  const next = parsePaths(raw?.next)
  await assertNoLocalConflicts(live, old, next)
  // Git metadata and dependencies follow source; profile directories never move.
  return {
    dependencySignature: raw.dependencySignature,
    next: [...next, ".git", "node_modules"],
    old: [...old, ".git", "node_modules"],
  }
}
