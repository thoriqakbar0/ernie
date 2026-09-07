import { mkdir } from "node:fs/promises"
import { readActivationPlan } from "./activation-plan.mjs"
import { moveEntries, restoreEntries } from "./activation-files.mjs"

/** Replaces source after shutdown. Failed moves restore previous source; profile paths stay in place. */
export async function activate(paths) {
  const plan = await readActivationPlan(paths)
  const { live, staged, backup } = paths
  await mkdir(backup)
  const movedOld = [], movedNew = []
  try {
    await moveEntries(live, backup, plan.old, movedOld)
    await moveEntries(staged, live, plan.next, movedNew)
  } catch (error) {
    await restoreEntries(live, staged, movedNew)
    await restoreEntries(backup, live, movedOld)
    throw error
  }
}
