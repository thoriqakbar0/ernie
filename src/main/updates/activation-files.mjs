import { lstat, mkdir, rename, rmdir } from "node:fs/promises"
import { dirname, join } from "node:path"

/** Checks existence without following a final symlink; other filesystem failures propagate. */
export async function exists(path) {
  try { await lstat(path); return true } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

async function ensureDirectory(path) {
  if (!await exists(path)) { await mkdir(path); return }
  const stat = await lstat(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Update conflicts with local data")
}

/** Moves one source entry, rejecting symlinked destination parents so profile data cannot be overwritten. */
export async function moveEntry(from, to, path) {
  let sourceParent = from, parent = to
  for (const part of path.split("/").slice(0, -1)) {
    sourceParent = join(sourceParent, part)
    const stat = await lstat(sourceParent)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Update conflicts with local data")
    parent = join(parent, part)
    await ensureDirectory(parent)
  }
  await rename(join(from, path), join(to, path))
  // Only emptied ancestors of the moved source entry are ours to prune. This
  // also reverses directory creation during rollback without touching data.
  for (let parent = dirname(join(from, path)); parent !== from; parent = dirname(parent)) {
    try { await rmdir(parent) } catch { break }
  }
}

/** Records each successful move immediately so rollback owns exactly the completed operations. */
export async function moveEntries(from, to, paths, completed) {
  for (const path of paths) {
    if (!await exists(join(from, path))) continue
    await moveEntry(from, to, path)
    completed.push(path)
  }
}

/** Restores completed moves in reverse order; recovery failures remain visible to the caller. */
export async function restoreEntries(from, to, completed) {
  for (const path of [...completed].reverse()) await moveEntry(from, to, path)
}
