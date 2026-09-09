import { spawn } from "node:child_process"
import { once } from "node:events"
import { setTimeout } from "node:timers/promises"

/** Parses the trusted launcher command before signaling readiness to quit. */
export const readRestartArguments = (args) => {
  const [live, staged, backup, executable, parent] = args
  if (![live, staged, backup, executable].every(Boolean) || !/^\d+$/u.test(parent ?? "")) {
    throw new Error("Invalid update arguments")
  }
  return { backup, executable, live, parent: Number(parent), staged }
}

const isRunning = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === "ESRCH") {
      return false
    }
    throw error
  }
}

/** Waits at most thirty seconds; source remains untouched if shutdown is cancelled. */
export const waitForExit = (pid) => {
  const poll = async (attempt) => {
    if (!isRunning(pid)) {
      return
    }
    if (attempt === 300) {
      throw new Error("Ernie did not exit; update cancelled")
    }
    await setTimeout(100)
    return poll(attempt + 1)
  }
  return poll(0)
}

/** Starts the packaged executable outside Node mode, detaching only after the OS accepts the spawn. */
export const relaunch = async (executable) => {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ZENBU_LAUNCHED_FROM_BUNDLE
  const child = spawn(executable, [], { detached: true, env, stdio: "ignore" })
  await once(child, "spawn")
  child.unref()
}
