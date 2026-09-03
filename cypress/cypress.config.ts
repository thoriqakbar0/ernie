import { spawn } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { createConnection } from "node:net"
import { defineConfig } from "cypress"
import { DaemonClient } from "prime-agent"

const rendererUrl = process.env.CYPRESS_rendererUrl
const browserUrl = process.env.CYPRESS_browserUrl
const hmrSentinelPath = process.env.CYPRESS_hmrSentinelPath
const primeAgentAgentDir = process.env.CYPRESS_primeAgentAgentDir
const primeAgentCliPath = process.env.CYPRESS_primeAgentCliPath
const primeAgentExecutablePath = process.env.CYPRESS_primeAgentExecutablePath
const primeAgentSocketPath = process.env.CYPRESS_primeAgentSocketPath

export default defineConfig({
  allowCypressEnv: false,
  e2e: {
    env: {
      ...(rendererUrl ? { rendererUrl } : {}),
      ...(browserUrl ? { browserUrl } : {}),
    },
    specPattern: browserUrl ? "e2e/browser.cy.ts" : "e2e/prime-agent.cy.ts",
    supportFile: "support/e2e.ts",
    setupNodeEvents(on) {
      if (!browserUrl) return
      if (!hmrSentinelPath) throw new Error("CYPRESS_hmrSentinelPath is required for browser integration")
      if (!primeAgentAgentDir || !primeAgentCliPath || !primeAgentExecutablePath || !primeAgentSocketPath) {
        throw new Error("Prime Agent browser recovery configuration is incomplete")
      }
      on("task", {
        async writeBrowserHmrRevision(revision: string) {
          await writeFile(
            hmrSentinelPath,
            `/** Browser development revision used to prove Vite HMR through the stable gateway. */\nexport const browserHmrRevision = ${JSON.stringify(revision)}\n`,
          )
          return null
        },
        async stopExternalPrimeAgentDaemon() {
          await terminatePrimeAgentDaemonSupervisor(primeAgentSocketPath)
          return null
        },
        async startExternalPrimeAgentDaemon() {
          startPrimeAgentDaemon({
            agentDir: primeAgentAgentDir,
            cliPath: primeAgentCliPath,
            executablePath: primeAgentExecutablePath,
            socketPath: primeAgentSocketPath,
          })
          await waitForSocket(primeAgentSocketPath)
          return null
        },
        async seedPersistedPrimeAgentSession() {
          await seedPersistedPrimeAgentSession(primeAgentSocketPath)
          return null
        },
      })
    },
  },
  defaultCommandTimeout: 15_000,
  pageLoadTimeout: 30_000,
  retries: 0,
  screenshotsFolder: "screenshots",
  screenshotOnRunFailure: true,
  video: false,
  viewportHeight: 750,
  viewportWidth: 1_100,
})

type PrimeAgentDaemonOptions = Readonly<{
  agentDir: string
  cliPath: string
  executablePath: string
  socketPath: string
}>

function startPrimeAgentDaemon({
  agentDir,
  cliPath,
  executablePath,
  socketPath,
}: PrimeAgentDaemonOptions) {
  const environment = { ...process.env }
  for (const name of Object.keys(environment)) {
    if (name.startsWith("PRIME_AGENT_INTERNAL_")) delete environment[name]
  }
  const daemon = spawn(
    executablePath,
    [cliPath, "--mode", "daemon", "--daemon-socket", socketPath],
    {
      detached: process.platform !== "win32",
      env: {
        ...environment,
        ELECTRON_RUN_AS_NODE: "1",
        PRIME_AGENT_CODING_AGENT_DIR: agentDir,
      },
      stdio: "ignore",
    },
  )
  daemon.unref()
}

async function waitForSocket(socketPath: string) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await canConnectToSocket(socketPath)) return
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Prime Agent daemon did not reopen ${socketPath}`)
}

async function terminatePrimeAgentDaemonSupervisor(socketPath: string) {
  const client = new DaemonClient(socketPath)
  let supervisorPid: number
  try {
    await client.connect()
    const hello = await client.waitForHello()
    const pid = hello.supervisorPid
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) {
      throw new Error("Prime Agent returned an invalid supervisor process id")
    }
    supervisorPid = pid
  } finally {
    client.close()
  }
  process.kill(supervisorPid, "SIGKILL")

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!await canConnectToSocket(socketPath)) return
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Prime Agent daemon did not close ${socketPath}`)
}

function canConnectToSocket(socketPath: string) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection(socketPath)
    const finish = (connected: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(connected)
    }
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
  })
}

async function seedPersistedPrimeAgentSession(socketPath: string) {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect()
    const list = await client.request({ type: "list" })
    if (!list.success) throw new Error(list.error)
    const activeSessionId = readSoleActiveSessionId(list.data)
    const seed = await client.request({
      type: "execute_bash_and_wait",
      activeSessionId,
      command: "printf recovery-ready",
    })
    if (!seed.success) throw new Error(seed.error)
  } finally {
    client.close()
  }
}

function readSoleActiveSessionId(value: unknown) {
  if (typeof value !== "object" || value === null || !("sessions" in value)) {
    throw new Error("Prime Agent returned an invalid session list")
  }
  if (!Array.isArray(value.sessions)) {
    throw new Error("Prime Agent returned an invalid session list")
  }
  const activeSessionIds = value.sessions.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || !("activeSessionId" in entry)) return []
    return typeof entry.activeSessionId === "string" ? [entry.activeSessionId] : []
  })
  if (activeSessionIds.length !== 1) {
    throw new Error(`Expected one active Prime Agent session, found ${activeSessionIds.length}`)
  }
  return activeSessionIds[0]
}
