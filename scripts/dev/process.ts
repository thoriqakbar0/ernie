import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"

export const startOwnedProcess = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  stdio: "inherit" | "pipe" = "inherit",
) =>
  spawn(command, [...args], {
    cwd,
    detached: process.platform !== "win32",
    env,
    stdio,
  })

export const waitForProcessExit = (
  child: ChildProcess,
): Promise<[number | null, NodeJS.Signals | null]> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve([child.exitCode, child.signalCode])
  }
  const { promise, resolve } = Promise.withResolvers<[number | null, NodeJS.Signals | null]>()
  child.once("exit", (code, signal) => resolve([code, signal]))
  return promise
}

const isNodeError = (error: unknown, code: string): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === code

const sendSignal = (child: ChildProcess, signal: NodeJS.Signals) => {
  if (child.pid === undefined) {
    return
  }
  try {
    if (process.platform === "win32") {
      child.kill(signal)
    } else {
      process.kill(-child.pid, signal)
    }
  } catch (error) {
    if (isNodeError(error, "ESRCH")) {
      return
    }
    if (isNodeError(error, "EPERM")) {
      child.kill(signal)
      return
    }
    throw error
  }
}

const waitForExitWithin = (child: ChildProcess, timeoutMs: number) => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true)
  }
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const onExit = () => resolve(true)
  const timer = setTimeout(() => {
    child.removeListener("exit", onExit)
    resolve(child.exitCode !== null || child.signalCode !== null)
  }, timeoutMs)
  child.once("exit", onExit)
  return promise.finally(() => clearTimeout(timer))
}

const terminateWindowsProcessTree = async (pid: number) => {
  const terminator = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
  await waitForProcessExit(terminator)
}

export const stopOwnedProcess = async (child: ChildProcess) => {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return
  }
  sendSignal(child, "SIGTERM")
  if (await waitForExitWithin(child, 3000)) {
    return
  }

  if (process.platform === "win32") {
    await terminateWindowsProcessTree(child.pid)
  } else {
    sendSignal(child, "SIGKILL")
  }
  await waitForExitWithin(child, 2000)
}
