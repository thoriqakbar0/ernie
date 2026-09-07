import type { ChildProcess } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { createServer } from "node:net"
import path from "node:path"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { tmpdir } from "node:os"

import { resolveDaemonSocketPath } from "../scripts/dev/config.ts"
import { startOwnedProcess, stopOwnedProcess, waitForProcessExit } from "../scripts/dev/process.ts"
import { shutdownPrimeAgentDaemon } from "../scripts/dev/prime-agent-daemon.ts"

type DevtoolsTarget = Readonly<{
  type: string
  url: string
}>

const cypressDirectory = import.meta.dirname
const projectDirectory = path.dirname(cypressDirectory)
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")
if (typeof electronModule !== "string") {
  throw new TypeError("Electron did not resolve to an executable path")
}

const electronExecutable = electronModule
const ownedChildren = new Set<ChildProcess>()
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ernie-cypress-"))
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

const handleSignal = async (signal: NodeJS.Signals) => {
  try {
    await cleanup()
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143)
  }
}

const startOwned = (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  stdio: "inherit" | "pipe" = "inherit",
) => {
  const child = startOwnedProcess(command, args, cwd, env, stdio)
  ownedChildren.add(child)
  child.once("exit", () => ownedChildren.delete(child))
  return child
}

const redactRuntimeToken = (value: string) =>
  value.replaceAll(/wsToken=[^&\s]+/gu, "wsToken=[redacted]")

const forwardRedactedOutput = (child: ChildProcess) => {
  const { stdout } = child
  const { stderr } = child
  if (!stdout || !stderr) {
    throw new Error("Electron E2E output was not captured")
  }
  stdout
    .setEncoding("utf-8")
    .on("data", (chunk: string) => process.stdout.write(redactRuntimeToken(chunk)))
  stderr
    .setEncoding("utf-8")
    .on("data", (chunk: string) => process.stderr.write(redactRuntimeToken(chunk)))
}

const runChecked = async (
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) => {
  const child = startOwned(command, args, cwd, env)
  const [code, signal] = await waitForProcessExit(child)
  if (code !== 0) {
    throw new Error(`${command} exited with ${code ?? signal ?? "an unknown status"}`)
  }
}

const reservePort = async () => {
  const server = createServer()
  server.unref()
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  if (typeof address === "string" || address === null) {
    server.close()
    throw new Error("Could not reserve an Electron debugging port")
  }
  await promisify(server.close.bind(server))()
  return address.port
}

const parseTargets = (input: unknown): readonly DevtoolsTarget[] => {
  if (!Array.isArray(input)) {
    return []
  }
  return input.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return []
    }
    if (!("type" in item) || !("url" in item)) {
      return []
    }
    return typeof item.type === "string" && typeof item.url === "string"
      ? [{ type: item.type, url: item.url }]
      : []
  })
}

const isMainRenderer = (target: DevtoolsTarget) => {
  if (target.type !== "page" || !target.url.startsWith("http")) {
    return false
  }
  const url = new URL(target.url)
  const viewType = url.searchParams.get("type")
  return (
    url.searchParams.has("wsPort") &&
    url.searchParams.has("wsToken") &&
    (viewType === null || viewType === "entrypoint")
  )
}

const waitForRendererUrl = async (port: number, electron: ChildProcess) => {
  const endpoint = `http://127.0.0.1:${port}/json/list`
  const deadline = Date.now() + 45_000
  let lastFailure = "the renderer was not ready"

  const poll = async (): Promise<string> => {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for the Zenbu renderer: ${lastFailure}`)
    }
    if (electron.exitCode !== null) {
      throw new Error(`Electron exited before its renderer was ready (${electron.exitCode})`)
    }

    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        const target = parseTargets(await response.json()).find(isMainRenderer)
        if (target) {
          return target.url
        }
      } else {
        lastFailure = `DevTools returned HTTP ${response.status}`
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "DevTools request failed"
    }

    await delay(250)
    return poll()
  }

  return await poll()
}

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await runChecked("nub", ["run", "link"], projectDirectory)

  const debuggingPort = await reservePort()
  const databaseDirectory = path.join(temporaryRoot, "zenbu-db")
  const agentDirectory = path.join(temporaryRoot, "agents")
  const electronProfile = path.join(temporaryRoot, "electron-profile")
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
    ERNIE_PRIME_AGENT_START_DAEMON: "1",
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
  const cypressExecutable = path.join(cypressDirectory, "node_modules", ".bin", "cypress")
  const cypressArguments = process.argv.includes("--open")
    ? ["open", "--e2e", "--browser", "electron"]
    : ["run", "--e2e", "--browser", "electron"]

  await runChecked(cypressExecutable, cypressArguments, cypressDirectory, {
    ...process.env,
    CYPRESS_primeAgentSocketPath: daemonSocketPath,
    CYPRESS_rendererUrl: rendererUrl,
    CYPRESS_workspacePath: projectDirectory,
  })
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await cleanup()
}
