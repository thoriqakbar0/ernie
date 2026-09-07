import { spawn, type ChildProcess } from "node:child_process"
import { access, chmod, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import type { TestContext } from "node:test"

function waitForReady(worker: ChildProcess) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Worker handshake timed out")), 5000)
    worker.once("message", (message: unknown) => {
      clearTimeout(timeout)
      if (message !== "ready") { reject(new Error("Invalid worker handshake")); return }
      worker.disconnect(); resolve()
    })
    worker.once("error", (error) => { clearTimeout(timeout); reject(error) })
  })
}

/** Owns a disposable parent and a real helper process, with a filesystem marker replacing the app executable. */
export async function startUpdateWorker(t: TestContext, root: string, paths: { live: string; staged: string; backup: string }) {
  const executable = join(root, "restart")
  await writeFile(executable, `#!/bin/sh\n: > '${root.replaceAll("'", "'\\''")}/restarted'\n`)
  await chmod(executable, 0o700)
  const parent = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" })
  t.after(() => { parent.kill() })
  if (!parent.pid) throw new Error("Fixture parent did not start")
  const worker = spawn(process.execPath, [join(process.cwd(), "src/main/updates/apply.mjs"), paths.live, paths.staged, paths.backup, executable, String(parent.pid)], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
  t.after(() => { worker.kill() })
  const done = new Promise<number | null>((resolve) => worker.once("exit", resolve))
  await waitForReady(worker)
  return { parent, done }
}

/** Waits for the fake executable's observable filesystem effect with a bounded deadline. */
export async function waitForRelaunch(root: string) {
  for (let attempt = 0; attempt <= 120; attempt++) {
    try { await access(join(root, "restarted")); return } catch { await delay(25) }
  }
  throw new Error("Relaunch was not observed")
}
