import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createConnection, createServer } from "node:net"
import path from "node:path"
import { once } from "node:events"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import type { ChildProcess } from "node:child_process"

import { startOwnedProcess, stopOwnedProcess, waitForProcessExit } from "./dev/process.ts"
import { shutdownPrimeAgentDaemon } from "./dev/prime-agent-daemon.ts"
import { resolveDaemonSocketPath } from "./dev/config.ts"

const projectRoot = path.dirname(import.meta.dirname)
const waitForUrl = async (url: string, child: ChildProcess) => {
  const deadline = Date.now() + 60_000
  let lastError: unknown
  const poll = async (): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error("Ernie browser development did not become ready", { cause: lastError })
    }
    if (child.exitCode !== null) {
      throw new Error(`Ernie browser development exited before it became ready (${child.exitCode})`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }
    await delay(100)
    return poll()
  }
  await poll()
}

const reservePort = async () => {
  const server = createServer()
  const listening = once(server, "listening")
  server.listen(0, "127.0.0.1")
  await listening
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a browser test port")
  }
  await promisify(server.close.bind(server))()
  return address.port
}

const startPrimeAgentDaemon = (socketPath: string, agentDir: string, cliPath: string) => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("PRIME_AGENT_INTERNAL_")),
  )
  return startOwnedProcess(
    process.execPath,
    [cliPath, "--mode", "daemon", "--daemon-socket", socketPath],
    projectRoot,
    {
      ...environment,
      ELECTRON_RUN_AS_NODE: "1",
      PRIME_AGENT_CODING_AGENT_DIR: agentDir,
    },
    "pipe",
  )
}

const canConnectToSocket = async (socketPath: string) => {
  const socket = createConnection(socketPath)
  try {
    await once(socket, "connect")
    return true
  } catch {
    return false
  } finally {
    socket.removeAllListeners()
    socket.destroy()
  }
}

const waitForDaemonSocket = async (socketPath: string, child: ChildProcess) => {
  const deadline = Date.now() + 10_000
  const poll = async (): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error(`Prime Agent daemon did not open ${socketPath}`)
    }
    if (child.exitCode !== null) {
      throw new Error(`Prime Agent daemon exited before readiness (${child.exitCode})`)
    }
    if (await canConnectToSocket(socketPath)) {
      return
    }
    await delay(100)
    return poll()
  }
  await poll()
}

const cypressDirectory = path.join(projectRoot, "cypress")
const temporaryRoot = await mkdtemp(path.join(tmpdir(), "ernie-browser-test-"))
const port = await reservePort()
const browserUrl = `http://127.0.0.1:${port}/?browser=1`
const hmrSentinelPath = path.join(temporaryRoot, "hmr-sentinel.ts")
const profile = `browser-test-${process.pid}`
const daemonSocketPath = resolveDaemonSocketPath(temporaryRoot, profile)
const primeAgentEntry = import.meta.resolve("prime-agent")
const primeAgentCliPath = fileURLToPath(new URL("bundle/cli.js", primeAgentEntry))
const primeAgentAgentDir = path.join(temporaryRoot, "prime-agent")
let primeAgentDaemon: ChildProcess | undefined
let development: ChildProcess | undefined
let cypress: ChildProcess | undefined
let cleanupPromise: Promise<void> | undefined

const cleanup = () => {
  cleanupPromise ??= (async () => {
    if (cypress) {
      await stopOwnedProcess(cypress)
    }
    if (development) {
      await stopOwnedProcess(development)
    }
    try {
      await shutdownPrimeAgentDaemon(daemonSocketPath)
    } catch {
      // Continue cleanup when the daemon is already unavailable.
    }
    if (primeAgentDaemon) {
      await stopOwnedProcess(primeAgentDaemon)
    }
    await delay(100)
    await rm(temporaryRoot, {
      force: true,
      maxRetries: 5,
      recursive: true,
      retryDelay: 100,
    })
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

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await mkdir(temporaryRoot, { recursive: true })
  await writeFile(
    hmrSentinelPath,
    '/** Isolated browser integration revision used to prove Vite HMR. */\nexport const browserHmrRevision = "initial"\n',
  )
  primeAgentDaemon = startPrimeAgentDaemon(daemonSocketPath, primeAgentAgentDir, primeAgentCliPath)
  await waitForDaemonSocket(daemonSocketPath, primeAgentDaemon)
  development = startOwnedProcess("nub", ["--node", "scripts/dev.ts"], projectRoot, {
    ...process.env,
    ERNIE_BROWSER_HMR_SENTINEL: hmrSentinelPath,
    ERNIE_DEV_OPEN_BROWSER: "0",
    ERNIE_DEV_PORT: String(port),
    ERNIE_DEV_PROFILE: profile,
    ERNIE_DEV_STATE_ROOT: temporaryRoot,
    ERNIE_PRIME_AGENT_SOCKET: daemonSocketPath,
    ERNIE_PRIME_AGENT_START_DAEMON: "0",
  })
  await waitForUrl(browserUrl, development)

  const executable = path.join(cypressDirectory, "node_modules", ".bin", "cypress")
  const args = process.argv.includes("--open")
    ? ["open", "--e2e", "--browser", "chrome"]
    : ["run", "--e2e", "--browser", "chrome"]
  cypress = startOwnedProcess(executable, args, cypressDirectory, {
    ...process.env,
    CYPRESS_browserUrl: browserUrl,
    CYPRESS_hmrSentinelPath: hmrSentinelPath,
    CYPRESS_primeAgentAgentDir: primeAgentAgentDir,
    CYPRESS_primeAgentCliPath: primeAgentCliPath,
    CYPRESS_primeAgentExecutablePath: process.execPath,
    CYPRESS_primeAgentSocketPath: daemonSocketPath,
    CYPRESS_workspacePath: projectRoot,
  })
  const [code, signal] = await waitForProcessExit(cypress)
  if (code !== 0) {
    throw new Error(`${executable} exited with ${code ?? signal ?? "an unknown status"}`)
  }
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await cleanup()
}
