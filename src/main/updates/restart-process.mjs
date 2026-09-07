import { spawn } from "node:child_process"
import { setTimeout } from "node:timers/promises"

/** Parses the trusted launcher command before signaling readiness to quit. */
export function readRestartArguments(args) {
  const [live, staged, backup, executable, parent] = args
  if (![live, staged, backup, executable].every(Boolean) || !/^\d+$/.test(parent ?? "")) throw new Error("Invalid update arguments")
  return { live, staged, backup, executable, parent: Number(parent) }
}

function isRunning(pid) {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === "ESRCH") return false
    throw error
  }
}

/** Waits at most thirty seconds; source remains untouched if shutdown is cancelled. */
export async function waitForExit(pid) {
  for (let attempt = 0; isRunning(pid); attempt++) {
    if (attempt === 300) throw new Error("Ernie did not exit; update cancelled")
    await setTimeout(100)
  }
}

/** Starts the packaged executable outside Node mode, detaching only after the OS accepts the spawn. */
export async function relaunch(executable) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ZENBU_LAUNCHED_FROM_BUNDLE
  const child = spawn(executable, [], { detached: true, stdio: "ignore", env })
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject) })
  child.unref()
}
