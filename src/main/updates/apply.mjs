import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { activate } from "./activation.mjs"
import { readRestartArguments, waitForExit, relaunch } from "./restart-process.mjs"

// Keep the worker's activation entry available to filesystem integration fixtures.
export { activate } from "./activation.mjs"

const activateAndRecord = async (paths) => {
  let outcome = "applied"
  try {
    await activate(paths)
  } catch {
    outcome = "failed"
  }
  await writeFile(`${paths.live}.update-result.json`, JSON.stringify({ outcome }))
}

const run = async () => {
  const paths = readRestartArguments(process.argv.slice(2))
  process.send?.("ready")
  await waitForExit(paths.parent)
  // Reporting must not prevent reopening the app after activation or rollback.
  try {
    await activateAndRecord(paths)
  } finally {
    await relaunch(paths.executable)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await run()
  } catch {
    process.exitCode = 1
  }
}
