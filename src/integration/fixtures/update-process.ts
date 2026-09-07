import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { once } from "node:events"
import { access, chmod, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { TestContext } from "node:test"

const waitForReady = async (worker: ChildProcess) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const [message]: unknown[] = await once(worker, "message", { signal: controller.signal })
    if (message !== "ready") {
      throw new Error("Invalid worker handshake")
    }
    worker.disconnect()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Worker handshake timed out", { cause: error })
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const waitForExit = async (worker: ChildProcess): Promise<number | null> => {
  try {
    await once(worker, "exit")
    return worker.exitCode
  } catch {
    return waitForExit(worker)
  }
}

/** Owns a disposable parent and a real helper process, with a filesystem marker replacing the app executable. */
export const startUpdateWorker = async (
  t: TestContext,
  root: string,
  paths: { live: string; staged: string; backup: string },
) => {
  const executable = path.join(root, "restart")
  await writeFile(executable, `#!/bin/sh\n: > '${root.replaceAll("'", "'\\''")}/restarted'\n`)
  await chmod(executable, 0o700)
  const parent = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  t.after(() => {
    parent.kill()
  })
  if (!parent.pid) {
    throw new Error("Fixture parent did not start")
  }
  const worker = spawn(
    process.execPath,
    [
      path.join(process.cwd(), "src/main/updates/apply.mjs"),
      paths.live,
      paths.staged,
      paths.backup,
      executable,
      String(parent.pid),
    ],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  )
  t.after(() => {
    worker.kill()
  })
  const done = waitForExit(worker)
  await waitForReady(worker)
  return { done, parent }
}

/** Waits for the fake executable's observable filesystem effect with a bounded deadline. */
export const waitForRelaunch = async (root: string) => {
  const attemptRelaunch = async (attempt: number): Promise<void> => {
    if (attempt > 120) {
      throw new Error("Relaunch was not observed")
    }
    try {
      await access(path.join(root, "restarted"))
    } catch {
      await delay(25)
      return attemptRelaunch(attempt + 1)
    }
  }
  await attemptRelaunch(0)
}
