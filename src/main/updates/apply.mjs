import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { activate } from "./activation.mjs"
import { readRestartArguments, waitForExit, relaunch } from "./restart-process.mjs"

// Keep the worker's activation entry available to filesystem integration fixtures.
export { activate } from "./activation.mjs"

async function activateAndRecord(paths) {
  let outcome = "applied"
  try { await activate(paths) } catch { outcome = "failed" }
  await writeFile(`${paths.live}.update-result.json`, JSON.stringify({ outcome }))
}

async function run() {
  const paths = readRestartArguments(process.argv.slice(2))
  process.send?.("ready")
  await waitForExit(paths.parent)
  await activateAndRecord(paths)
  await relaunch(paths.executable)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(() => { process.exitCode = 1 })
}
