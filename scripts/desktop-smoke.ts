import { spawn, type ChildProcess } from "node:child_process"
import { access, mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

import { stopOwnedProcess } from "./dev/process.ts"
import { shutdownPrimeAgentDaemon } from "./dev/prime-agent-daemon.ts"
import { resolveDaemonSocketPath } from "./dev/config.ts"

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const temporaryRoot = await mkdtemp(join(tmpdir(), "ernie-desktop-smoke-"))
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")
if (typeof electronModule !== "string") throw new Error("Electron did not resolve to an executable path")

const electronExecutable = electronModule
const databaseDirectory = join(temporaryRoot, "zenbu-db")
const agentDirectory = join(temporaryRoot, "prime-agent")
const daemonSocketPath = resolveDaemonSocketPath(temporaryRoot, `desktop-smoke-${process.pid}`)
const electronProfileDirectory = join(temporaryRoot, "electron-user-data")
const readyFile = join(temporaryRoot, "renderer-connected")
await Promise.all([
  mkdir(databaseDirectory, { recursive: true }),
  mkdir(agentDirectory, { recursive: true }),
  mkdir(electronProfileDirectory, { recursive: true }),
])

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.NODE_OPTIONS
Object.assign(environment, {
  ERNIE_PRIME_AGENT_AGENT_DIR: agentDirectory,
  ERNIE_PRIME_AGENT_EXECUTABLE: electronExecutable,
  ERNIE_PRIME_AGENT_SOCKET: daemonSocketPath,
  ERNIE_DESKTOP_SMOKE_READY_FILE: readyFile,
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
    { cwd: projectRoot, detached: process.platform !== "win32", env: environment, stdio: ["ignore", "pipe", "pipe"] },
  )
  const stdout = child.stdout
  const stderr = child.stderr
  if (!stdout || !stderr) throw new Error("Desktop smoke did not capture Electron output")
  stdout.setEncoding("utf8").on("data", (chunk: string) => {
    const safe = redactRuntimeToken(chunk)
    output += safe
    process.stdout.write(safe)
  })
  stderr.setEncoding("utf8").on("data", (chunk: string) => {
    const safe = redactRuntimeToken(chunk)
    output += safe
    process.stderr.write(safe)
  })

  const [code, signal] = await waitForExit(child, 45_000)
  if (code !== 0) throw new Error(`Desktop smoke exited with ${code ?? signal ?? "an unknown status"}`)
  if (!output.includes("[zenbu] renderer-url")) throw new Error("Desktop smoke never opened the real renderer")
  if (!output.includes("[zenbu] ready")) throw new Error("Desktop smoke never reached Zenbu readiness")
  if (!await fileExists(readyFile)) throw new Error("Desktop smoke renderer never connected to Zenbu")
} finally {
  if (child) await stopOwnedProcess(child)
  await shutdownPrimeAgentDaemon(daemonSocketPath)
  await rm(temporaryRoot, { recursive: true, force: true })
}

function redactRuntimeToken(value: string) {
  return value.replace(/wsToken=[^&\s]+/g, "wsToken=[redacted]")
}

function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<[number | null, NodeJS.Signals | null]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.removeListener("exit", onExit)
      reject(new Error("Desktop smoke timed out"))
    }, timeoutMs)
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer)
      resolve([code, signal])
    }
    child.once("exit", onExit)
  })
}

async function fileExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}
