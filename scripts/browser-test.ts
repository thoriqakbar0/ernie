import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import type { ChildProcess } from "node:child_process"

import { startOwnedProcess, stopOwnedProcess, waitForProcessExit } from "./dev/process.ts"
import { shutdownPrimeAgentDaemon } from "./dev/prime-agent-daemon.ts"
import { resolveDaemonSocketPath } from "./dev/config.ts"

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const cypressDirectory = join(projectRoot, "cypress")
const temporaryRoot = await mkdtemp(join(tmpdir(), "ernie-browser-test-"))
const port = await reservePort()
const browserUrl = `http://127.0.0.1:${port}/?browser=1`
const hmrSentinelPath = join(temporaryRoot, "hmr-sentinel.ts")
const profile = `browser-test-${process.pid}`
const daemonSocketPath = resolveDaemonSocketPath(temporaryRoot, profile)
let development: ChildProcess | undefined
let cypress: ChildProcess | undefined
let cleanupPromise: Promise<void> | undefined

const cleanup = () => {
  cleanupPromise ??= (async () => {
    if (cypress) await stopOwnedProcess(cypress)
    if (development) await stopOwnedProcess(development)
    await shutdownPrimeAgentDaemon(daemonSocketPath)
    await rm(temporaryRoot, { recursive: true, force: true })
  })()
  return cleanupPromise
}

const handleSignal = (signal: NodeJS.Signals) => {
  void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143))
}

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await mkdir(temporaryRoot, { recursive: true })
  await writeFile(
    hmrSentinelPath,
    '/** Isolated browser integration revision used to prove Vite HMR. */\nexport const browserHmrRevision = "initial"\n',
  )
  development = startOwnedProcess(
    "nub",
    ["--node", "scripts/dev.ts"],
    projectRoot,
    {
      ...process.env,
      ERNIE_DEV_OPEN_BROWSER: "0",
      ERNIE_DEV_PORT: String(port),
      ERNIE_DEV_PROFILE: profile,
      ERNIE_DEV_STATE_ROOT: temporaryRoot,
      ERNIE_BROWSER_HMR_SENTINEL: hmrSentinelPath,
    },
  )
  await waitForUrl(browserUrl, development)

  const executable = join(cypressDirectory, "node_modules", ".bin", "cypress")
  const args = process.argv.includes("--open")
    ? ["open", "--e2e", "--browser", "chrome"]
    : ["run", "--e2e", "--browser", "chrome"]
  cypress = startOwnedProcess(executable, args, cypressDirectory, {
    ...process.env,
    CYPRESS_browserUrl: browserUrl,
    CYPRESS_hmrSentinelPath: hmrSentinelPath,
  })
  const [code, signal] = await waitForProcessExit(cypress)
  if (code !== 0) throw new Error(`${executable} exited with ${code ?? signal ?? "an unknown status"}`)
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await cleanup()
}

async function waitForUrl(url: string, child: ChildProcess) {
  const deadline = Date.now() + 60_000
  let lastError: unknown
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Ernie browser development exited before it became ready (${child.exitCode})`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch (error) {
      lastError = error
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("Ernie browser development did not become ready", { cause: lastError })
}

async function reservePort() {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("Could not reserve a browser test port")
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}
