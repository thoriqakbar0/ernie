import { lstat, mkdir, rename, rmdir } from "node:fs/promises"
import nodePath from "node:path"

// Filesystem moves and cleanup depend on earlier operations completing successfully.
const runSequentially = async (items, operation) => {
  const iterator = items[Symbol.iterator]()
  const advance = async () => {
    const next = iterator.next()
    if (next.done) {
      return
    }
    await operation(next.value)
    await advance()
  }
  await advance()
}

const pruneAncestors = async (parent, root) => {
  if (parent === root) {
    return
  }
  try {
    await rmdir(parent)
  } catch {
    return
  }
  await pruneAncestors(nodePath.dirname(parent), root)
}

/** Checks existence without following a final symlink; other filesystem failures propagate. */
export const exists = async (path) => {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

const ensureDirectory = async (path) => {
  if (!(await exists(path))) {
    await mkdir(path)
    return true
  }
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Update conflicts with local data")
  }
}

/** Moves one source entry, rejecting symlinked destination parents so profile data cannot be overwritten. */
export const moveEntry = async (from, to, path) => {
  const created = []
  try {
    let sourceParent = from
    let parent = to
    await runSequentially(path.split("/").slice(0, -1), async (part) => {
      sourceParent = nodePath.join(sourceParent, part)
      const stat = await lstat(sourceParent)
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error("Update conflicts with local data")
      }
      parent = nodePath.join(parent, part)
      if (await ensureDirectory(parent)) {
        created.push(parent)
      }
    })
    await rename(nodePath.join(from, path), nodePath.join(to, path))
  } catch (error) {
    // A failed move is not journaled, so undo its directory creation here.
    await runSequentially(created.toReversed(), (parent) => rmdir(parent))
    throw error
  }
  // Only emptied ancestors of the moved source entry are ours to prune. This
  // also reverses directory creation during rollback without touching data.
  await pruneAncestors(nodePath.dirname(nodePath.join(from, path)), from)
}

/** Records each successful move immediately so rollback owns exactly the completed operations. */
export const moveEntries = async (from, to, paths, completed) => {
  await runSequentially(paths, async (path) => {
    if (!(await exists(nodePath.join(from, path)))) {
      return
    }
    await moveEntry(from, to, path)
    completed.push(path)
  })
}

/** Restores completed moves in reverse order; recovery failures remain visible to the caller. */
export const restoreEntries = async (from, to, completed) => {
  await runSequentially(completed.toReversed(), (path) => moveEntry(from, to, path))
}
