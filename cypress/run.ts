import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { tmpdir } from "node:os"

type DevtoolsTarget = Readonly<{
  type: string
  url: string
}>

const cypressDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = dirname(cypressDirectory)
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")
const primeAgentEntry = fileURLToPath(import.meta.resolve("prime-agent"))
const daemonLaunchModule: unknown = await import(pathToFileURL(
  join(dirname(primeAgentEntry), "cli", "daemon-launch.js"),
).href)
const shutdownDaemonAndWait = readShutdownDaemonAndWait(daemonLaunchModule)

if (typeof electronModule !== "string") {
  throw new Error("Electron did not resolve to an executable path")
}

const electronExecutable = electronModule
const ownedChildren = new Set<ChildProcess>()
const temporaryRoot = await mkdtemp(join(tmpdir(), "ernie-cypress-"))
const daemonSocketPath = join(temporaryRoot, "prime-agent.sock")
let cleanupPromise: Promise<void> | undefined

const cleanup = () => {
  cleanupPromise ??= (async () => {
    await Promise.all([...ownedChildren].map((child) => terminate(child)))
    if (!await shutdownDaemonAndWait(daemonSocketPath, 10_000)) {
      throw new Error(`Prime Agent daemon stayed active on ${daemonSocketPath}`)
    }
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
  )
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

type ShutdownDaemonAndWait = (socketPath: string, timeoutMs?: number) => Promise<boolean>

function readShutdownDaemonAndWait(input: unknown): ShutdownDaemonAndWait {
  if (!input || typeof input !== "object") {
    throw new Error("Prime Agent daemon launcher did not load")
  }
  const shutdown = (input as Record<string, unknown>).shutdownDaemonAndWait
  if (typeof shutdown !== "function") {
    throw new Error("Prime Agent does not expose daemon shutdown")
  }
  return shutdown as ShutdownDaemonAndWait
}

function startOwned(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env,
    stdio: "inherit",
  })
  ownedChildren.add(child)
  child.once("exit", () => ownedChildren.delete(child))
  return child
}

async function runChecked(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = startOwned(command, args, cwd, env)
  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null]
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
    const target = item as Record<string, unknown>
    return typeof target.type === "string" && typeof target.url === "string"
      ? [{ type: target.type, url: target.url }]
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

async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return

  const exited = once(child, "exit").catch(() => undefined)
  sendSignal(child, "SIGKILL")
  await Promise.race([exited, delay(3_000)])
}

function sendSignal(child: ChildProcess, signal: NodeJS.Signals) {
  if (child.pid === undefined) return
  try {
    if (process.platform === "win32") child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
