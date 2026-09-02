import { spawn, type ChildProcess } from "node:child_process"

export function startOwnedProcess(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdio: "inherit" | "pipe" = "inherit",
) {
  return spawn(command, [...args], {
    cwd,
    detached: process.platform !== "win32",
    env,
    stdio,
  })
}

export function waitForProcessExit(
  child: ChildProcess,
): Promise<[number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve([child.exitCode, child.signalCode])
  }
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve([code, signal]))
  })
}

export async function stopOwnedProcess(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return
  sendSignal(child, "SIGTERM")
  if (await waitForExitWithin(child, 3_000)) return

  if (process.platform === "win32") {
    await terminateWindowsProcessTree(child.pid)
  } else {
    sendSignal(child, "SIGKILL")
  }
  await waitForExitWithin(child, 2_000)
}

function sendSignal(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (isNodeError(error, "ESRCH")) return
    if (isNodeError(error, "EPERM")) {
      child.kill(signal)
      return
    }
    throw error
  }
}

function waitForExitWithin(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit)
      resolve(child.exitCode !== null || child.signalCode !== null)
    }, timeoutMs)
    child.once("exit", onExit)
  })
}

async function terminateWindowsProcessTree(pid: number) {
  const terminator = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
  await waitForProcessExit(terminator)
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code
}
