import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { access, mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { once } from "node:events"
import { tmpdir } from "node:os"

import { stopOwnedProcess } from "./dev/process.ts"
import { shutdownPrimeAgentDaemon } from "./dev/prime-agent-daemon.ts"
import { resolveDaemonSocketPath } from "./dev/config.ts"

const redactRuntimeToken = (value: string) =>
  value.replaceAll(/wsToken=[^&\s]+/gu, "wsToken=[redacted]")

const waitForExit = async (
  smokeProcess: ChildProcess,
  timeoutMs: number,
): Promise<[number | null, NodeJS.Signals | null]> => {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error("Desktop smoke timed out"))
  }, timeoutMs)
  try {
    await once(smokeProcess, "exit", { signal: controller.signal })
    return [smokeProcess.exitCode, smokeProcess.signalCode]
  } catch (error) {
    if (controller.signal.aborted) {
      throw controller.signal.reason
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

const projectRoot = path.dirname(import.meta.dirname)
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ernie-desktop-smoke-"))
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")
if (typeof electronModule !== "string") {
  throw new TypeError("Electron did not resolve to an executable path")
}

const electronExecutable = electronModule
const databaseDirectory = path.join(temporaryRoot, "zenbu-db")
const agentDirectory = path.join(temporaryRoot, "prime-agent")
const daemonSocketPath = resolveDaemonSocketPath(temporaryRoot, `desktop-smoke-${process.pid}`)
const electronProfileDirectory = path.join(temporaryRoot, "electron-user-data")
const readyFile = path.join(temporaryRoot, "renderer-connected")
await Promise.all([
  mkdir(databaseDirectory, { recursive: true }),
  mkdir(agentDirectory, { recursive: true }),
  mkdir(electronProfileDirectory, { recursive: true }),
])

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.NODE_OPTIONS
Object.assign(environment, {
  ERNIE_DESKTOP_SMOKE_READY_FILE: readyFile,
  ERNIE_PRIME_AGENT_AGENT_DIR: agentDirectory,
  ERNIE_PRIME_AGENT_EXECUTABLE: electronExecutable,
  ERNIE_PRIME_AGENT_SOCKET: daemonSocketPath,
  ERNIE_PRIME_AGENT_START_DAEMON: "1",
  ERNIE_RENDERER_MODE: "desktop",
  ERNIE_ZENBU_DB: databaseDirectory,
  ZENBU_AUTO_QUIT_AFTER_READY_MS: "5000",
})

let output = ""
let child: ChildProcess | undefined
try {
  child = spawn(
    electronExecutable,
    [".", "--project=.", `--user-data-dir=${electronProfileDirectory}`],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
  const { stdout } = child
  const { stderr } = child
  if (!stdout || !stderr) {
    throw new Error("Desktop smoke did not capture Electron output")
  }
  stdout.setEncoding("utf-8").on("data", (chunk: string) => {
    const safe = redactRuntimeToken(chunk)
    output += safe
    process.stdout.write(safe)
  })
  stderr.setEncoding("utf-8").on("data", (chunk: string) => {
    const safe = redactRuntimeToken(chunk)
    output += safe
    process.stderr.write(safe)
  })

  const [code, signal] = await waitForExit(child, 45_000)
  if (code !== 0) {
    throw new Error(`Desktop smoke exited with ${code ?? signal ?? "an unknown status"}`)
  }
  if (!output.includes("[zenbu] renderer-url")) {
    throw new Error("Desktop smoke never opened the real renderer")
  }
  if (!output.includes("[zenbu] ready")) {
    throw new Error("Desktop smoke never reached Zenbu readiness")
  }
  if (!(await fileExists(readyFile))) {
    throw new Error("Desktop smoke renderer never connected to Zenbu")
  }
} finally {
  if (child) {
    await stopOwnedProcess(child)
  }
  await shutdownPrimeAgentDaemon(daemonSocketPath)
  await rm(temporaryRoot, { force: true, recursive: true })
}
