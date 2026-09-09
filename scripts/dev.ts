import { spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { randomUUID } from "node:crypto"
import { once } from "node:events"
import { mkdir } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"

import { readDevConfig } from "./dev/config.ts"
import { startDevelopmentGateway } from "./dev/gateway.ts"
import type { DevelopmentGateway } from "./dev/gateway.ts"
import { startOwnedProcess, stopOwnedProcess, waitForProcessExit } from "./dev/process.ts"
import { acquireDevelopmentOwnership, readDevelopmentOwner } from "./dev/ownership.ts"
import type { DevelopmentOwnership } from "./dev/ownership.ts"
import {
  assertRuntimeAttachment,
  readRuntimeDescriptor,
  removeRuntimeDescriptor,
  waitForRuntimeDescriptor,
} from "./dev/runtime.ts"

const projectRoot = path.dirname(import.meta.dirname)
const config = readDevConfig(process.argv.slice(2), process.env, projectRoot)
const require = createRequire(import.meta.url)
const electronModule: unknown = require("electron")

if (typeof electronModule !== "string") {
  throw new TypeError("Electron did not resolve to an executable path")
}

const electronExecutable = electronModule
let serverChild: ChildProcess | undefined
let gateway: DevelopmentGateway | undefined
let ownership: DevelopmentOwnership | undefined
let closing = false

const close = async () => {
  if (closing) {
    return
  }
  closing = true
  const failures: unknown[] = []
  await gateway?.close().catch((error: unknown) => failures.push(error))
  if (serverChild) {
    await stopOwnedProcess(serverChild).catch((error: unknown) => failures.push(error))
  }
  await ownership?.release().catch((error: unknown) => failures.push(error))
  if (failures.length > 0) {
    throw new AggregateError(failures, "Ernie development cleanup failed")
  }
}

const handleSignal = async (signal: NodeJS.Signals) => {
  try {
    await close()
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143)
  }
}

const redactRuntimeToken = (value: string) =>
  value
    .replaceAll(/wsToken=[^&\s]+/gu, "wsToken=[redacted]")
    .replaceAll(/(?<prefix>[?&]token=)[^&\s]+/gu, "$<prefix>[redacted]")

const forwardRedactedOutput = (child: ChildProcess) => {
  const { stdout } = child
  const { stderr } = child
  if (!stdout || !stderr) {
    throw new Error("Managed Electron output was not captured")
  }
  stdout
    .setEncoding("utf-8")
    .on("data", (chunk: string) => process.stdout.write(redactRuntimeToken(chunk)))
  stderr
    .setEncoding("utf-8")
    .on("data", (chunk: string) => process.stderr.write(redactRuntimeToken(chunk)))
}

const printRuntime = (origin: string) => {
  console.log("\nErnie development")
  console.log(`Mode:     ${config.role}`)
  console.log(`Profile:  ${config.profile}`)
  console.log(`State:    ${config.stateRoot}`)
  console.log(`Runtime:  ${origin}`)
}

const openBrowser = (url: string) => {
  if (process.env.ERNIE_DEV_OPEN_BROWSER === "0") {
    return
  }
  let command = "xdg-open"
  if (process.platform === "darwin") {
    command = "open"
  } else if (process.platform === "win32") {
    command = "cmd"
  }
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url]
  const child = spawn(command, args, { detached: true, stdio: "ignore" })
  child.unref()
}

const isProcessRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const probeRuntime = async (origin: string) => {
  const response = await fetch(origin, { signal: AbortSignal.timeout(2000) })
  if (!response.ok) {
    throw new Error(`Zenbu service host health probe failed with ${response.status}`)
  }
}

const waitForSignal = () => once(process, "exit")

process.once("SIGINT", handleSignal)
process.once("SIGTERM", handleSignal)

try {
  await mkdir(config.stateRoot, { recursive: true })

  if (config.role === "all" || config.role === "server" || config.role === "desktop") {
    const generation = randomUUID()
    ownership = await acquireDevelopmentOwnership(config.ownerFile, generation)
    await Promise.all([
      mkdir(config.databaseDirectory, { recursive: true }),
      mkdir(config.electronProfileDirectory, { recursive: true }),
      removeRuntimeDescriptor(config.runtimeFile),
      ...(config.agentDirectory ? [mkdir(config.agentDirectory, { recursive: true })] : []),
    ])

    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    delete environment.NODE_OPTIONS
    Object.assign(environment, {
      ERNIE_DEV_GENERATION: generation,
      ERNIE_DEV_RUNTIME_FILE: config.runtimeFile,
      ERNIE_PRIME_AGENT_SOCKET: config.daemonSocketPath,
      ERNIE_RENDERER_MODE: config.role === "desktop" ? "desktop" : "server",
      ERNIE_ZENBU_DB: config.databaseDirectory,
      ...(config.agentDirectory ? { ERNIE_PRIME_AGENT_AGENT_DIR: config.agentDirectory } : {}),
    })

    serverChild = startOwnedProcess(
      electronExecutable,
      [".", "--project=.", `--user-data-dir=${config.electronProfileDirectory}`],
      config.root,
      environment,
      "pipe",
    )
    forwardRedactedOutput(serverChild)
    if (config.role === "desktop") {
      printRuntime("managed by the Electron window")
    } else {
      const descriptor = await waitForRuntimeDescriptor(
        config.runtimeFile,
        generation,
        () => serverChild?.exitCode === null,
      )
      printRuntime(descriptor.origin)

      if (config.role === "all") {
        gateway = await startDevelopmentGateway(config.host, config.port, descriptor)
        console.log(`Browser:  ${gateway.url}`)
        openBrowser(gateway.url)
      }
    }

    const [code, signal] = await waitForProcessExit(serverChild)
    if (!closing && code !== 0) {
      throw new Error(`Zenbu service host exited with ${code ?? signal ?? "an unknown status"}`)
    }
  } else {
    const [descriptor, owner] = await Promise.all([
      readRuntimeDescriptor(config.runtimeFile),
      readDevelopmentOwner(config.ownerFile),
    ])
    assertRuntimeAttachment(descriptor, owner, isProcessRunning)
    await probeRuntime(descriptor.origin)
    gateway = await startDevelopmentGateway(config.host, config.port, descriptor)
    console.log(`Browser:  ${gateway.url}`)
    openBrowser(gateway.url)
    await waitForSignal()
  }
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await close()
}
