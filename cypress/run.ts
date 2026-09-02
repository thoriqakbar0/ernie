import type { ChildProcess } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"

import { resolveDaemonSocketPath } from "../scripts/dev/config.ts"
import { startOwnedProcess, stopOwnedProcess, waitForProcessExit } from "../scripts/dev/process.ts"
import { shutdownPrimeAgentDaemon } from "../scripts/dev/prime-agent-daemon.ts"

type DevtoolsTarget = Readonly<{
  type: string
  url: string
}>

const cypressDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = dirname(cypressDirectory)
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")
if (typeof electronModule !== "string") {
  throw new Error("Electron did not resolve to an executable path")
}

const electronExecutable = electronModule
const ownedChildren = new Set<ChildProcess>()
const temporaryRoot = await mkdtemp(join(tmpdir(), "ernie-cypress-"))
const daemonSocketPath = resolveDaemonSocketPath(temporaryRoot, `cypress-${process.pid}`)
let cleanupPromise: Promise<void> | undefined

const cleanup = () => {
  cleanupPromise ??= (async () => {
    await Promise.all([...ownedChildren].map((child) => stopOwnedProcess(child)))
    await shutdownPrimeAgentDaemon(daemonSocketPath)
    await rm(temporaryRoot, { force: true, recursive: true })
  })()
  return cleanupPromise
}

const handleSignal = (signal: NodeJS.Signals) => {
  void cleanup().finally(() => {
    process.exit(signal === "SIGINT" ? 130 : 143)
  })
}

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await runChecked("nub", ["run", "link"], projectDirectory)

  const debuggingPort = await reservePort()
  const databaseDirectory = join(temporaryRoot, "zenbu-db")
  const agentDirectory = join(temporaryRoot, "agents")
  const electronProfile = join(temporaryRoot, "electron-profile")
  await Promise.all([
    mkdir(databaseDirectory, { recursive: true }),
    mkdir(agentDirectory, { recursive: true }),
    mkdir(electronProfile, { recursive: true }),
  ])

  const electronEnvironment = { ...process.env }
  delete electronEnvironment.ELECTRON_RUN_AS_NODE
  delete electronEnvironment.NODE_OPTIONS
  Object.assign(electronEnvironment, {
    ERNIE_PRIME_AGENT_AGENT_DIR: agentDirectory,
    ERNIE_PRIME_AGENT_EXECUTABLE: electronExecutable,
    ERNIE_PRIME_AGENT_SOCKET: daemonSocketPath,
    ERNIE_ZENBU_DB: databaseDirectory,
    VITE_ERNIE_CYPRESS: "1",
  })

  const electron = startOwned(
    electronExecutable,
    [
      ".",
      "--project=.",
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${electronProfile}`,
    ],
    projectDirectory,
    electronEnvironment,
    "pipe",
  )
  forwardRedactedOutput(electron)
  const rendererUrl = await waitForRendererUrl(debuggingPort, electron)
  const cypressExecutable = join(cypressDirectory, "node_modules", ".bin", "cypress")
  const cypressArguments = process.argv.includes("--open")
    ? ["open", "--e2e", "--browser", "electron"]
    : ["run", "--e2e", "--browser", "electron"]

  await runChecked(cypressExecutable, cypressArguments, cypressDirectory, {
    ...process.env,
    CYPRESS_rendererUrl: rendererUrl,
  })
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await cleanup()
}

function startOwned(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  stdio: "inherit" | "pipe" = "inherit",
) {
  const child = startOwnedProcess(command, args, cwd, env, stdio)
  ownedChildren.add(child)
  child.once("exit", () => ownedChildren.delete(child))
  return child
}

function forwardRedactedOutput(child: ChildProcess) {
  const stdout = child.stdout
  const stderr = child.stderr
  if (!stdout || !stderr) throw new Error("Electron E2E output was not captured")
  stdout.setEncoding("utf8").on("data", (chunk: string) => process.stdout.write(redactRuntimeToken(chunk)))
  stderr.setEncoding("utf8").on("data", (chunk: string) => process.stderr.write(redactRuntimeToken(chunk)))
}

function redactRuntimeToken(value: string) {
  return value.replace(/wsToken=[^&\s]+/g, "wsToken=[redacted]")
}

async function runChecked(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = startOwned(command, args, cwd, env)
  const [code, signal] = await waitForProcessExit(child)
  if (code !== 0) {
    throw new Error(`${command} exited with ${code ?? signal ?? "an unknown status"}`)
  }
}

async function reservePort() {
  const server = createServer()
  server.unref()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (typeof address === "string" || address === null) {
    server.close()
    throw new Error("Could not reserve an Electron debugging port")
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  return address.port
}

async function waitForRendererUrl(port: number, electron: ChildProcess) {
  const endpoint = `http://127.0.0.1:${port}/json/list`
  const deadline = Date.now() + 45_000
  let lastFailure = "the renderer was not ready"

  while (Date.now() < deadline) {
    if (electron.exitCode !== null) {
      throw new Error(`Electron exited before its renderer was ready (${electron.exitCode})`)
    }

    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) {
        const target = parseTargets(await response.json()).find(isMainRenderer)
        if (target) return target.url
      } else {
        lastFailure = `DevTools returned HTTP ${response.status}`
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "DevTools request failed"
    }

    await delay(250)
  }

  throw new Error(`Timed out waiting for the Zenbu renderer: ${lastFailure}`)
}

function parseTargets(input: unknown): readonly DevtoolsTarget[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    if (!("type" in item) || !("url" in item)) return []
    return typeof item.type === "string" && typeof item.url === "string"
      ? [{ type: item.type, url: item.url }]
      : []
  })
}

function isMainRenderer(target: DevtoolsTarget) {
  if (target.type !== "page" || !target.url.startsWith("http")) return false
  const url = new URL(target.url)
  const viewType = url.searchParams.get("type")
  return url.searchParams.has("wsPort") &&
    url.searchParams.has("wsToken") &&
    (viewType === null || viewType === "entrypoint")
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
