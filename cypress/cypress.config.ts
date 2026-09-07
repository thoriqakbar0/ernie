import { spawn } from "node:child_process"
import { once } from "node:events"
import { writeFile } from "node:fs/promises"
import { createConnection } from "node:net"
import { setTimeout as delay } from "node:timers/promises"
import { defineConfig } from "cypress"
import { DaemonClient } from "prime-agent"

const rendererUrl = process.env.CYPRESS_rendererUrl
const browserUrl = process.env.CYPRESS_browserUrl
const hmrSentinelPath = process.env.CYPRESS_hmrSentinelPath
const primeAgentAgentDir = process.env.CYPRESS_primeAgentAgentDir
const primeAgentCliPath = process.env.CYPRESS_primeAgentCliPath
const primeAgentExecutablePath = process.env.CYPRESS_primeAgentExecutablePath
const primeAgentSocketPath = process.env.CYPRESS_primeAgentSocketPath
const workspacePath = process.env.CYPRESS_workspacePath

type PrimeAgentDaemonOptions = Readonly<{
  agentDir: string
  cliPath: string
  executablePath: string
  socketPath: string
}>

const startPrimeAgentDaemon = ({
  agentDir,
  cliPath,
  executablePath,
  socketPath,
}: PrimeAgentDaemonOptions) => {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("PRIME_AGENT_INTERNAL_")),
  )
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

const waitForSocketState = async (
  socketPath: string,
  connected: boolean,
  deadline: number,
): Promise<void> => {
  if (Date.now() >= deadline) {
    throw new Error(`Prime Agent daemon did not ${connected ? "reopen" : "close"} ${socketPath}`)
  }
  if ((await canConnectToSocket(socketPath)) === connected) {
    return
  }
  await delay(100)
  return waitForSocketState(socketPath, connected, deadline)
}

const waitForSocket = (socketPath: string) =>
  waitForSocketState(socketPath, true, Date.now() + 10_000)

const terminatePrimeAgentDaemonSupervisor = async (socketPath: string) => {
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

  await waitForSocketState(socketPath, false, Date.now() + 10_000)
}

const ensureSoleActiveSession = async (client: DaemonClient, value: unknown, cwd: string) => {
  if (typeof value !== "object" || value === null || !("sessions" in value)) {
    throw new Error("Prime Agent returned an invalid session list")
  }
  if (!Array.isArray(value.sessions)) {
    throw new TypeError("Prime Agent returned an invalid session list")
  }
  const activeSessionIds = value.sessions.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || !("activeSessionId" in entry)) {
      return []
    }
    return typeof entry.activeSessionId === "string" ? [entry.activeSessionId] : []
  })
  if (activeSessionIds.length === 0) {
    const created = await client.request({
      config: { cwd },
      lifecycle: "resident",
      name: "Browser integration session",
      noSession: true,
      type: "create",
    })
    if (!created.success) {
      throw new Error(created.error)
    }
    if (
      typeof created.data !== "object" ||
      created.data === null ||
      !("activeSessionId" in created.data)
    ) {
      throw new Error("Prime Agent returned an invalid created session")
    }
    if (typeof created.data.activeSessionId !== "string") {
      throw new TypeError("Prime Agent returned an invalid created session")
    }
    return created.data.activeSessionId
  }
  if (activeSessionIds.length !== 1) {
    throw new Error(`Expected one active Prime Agent session, found ${activeSessionIds.length}`)
  }
  return activeSessionIds[0]
}

const seedPersistedPrimeAgentSession = async (socketPath: string, cwd: string) => {
  const client = new DaemonClient(socketPath)
  try {
    await client.connect()
    const list = await client.request({ type: "list" })
    if (!list.success) {
      throw new Error(list.error)
    }
    const activeSessionId = await ensureSoleActiveSession(client, list.data, cwd)
    const seed = await client.request({
      activeSessionId,
      command: "printf recovery-ready",
      type: "execute_bash_and_wait",
    })
    if (!seed.success) {
      throw new Error(seed.error)
    }
  } finally {
    client.close()
  }
}

export default defineConfig({
  allowCypressEnv: false,
  defaultCommandTimeout: 15_000,
  e2e: {
    env: {
      ...(rendererUrl ? { rendererUrl } : {}),
      ...(browserUrl ? { browserUrl } : {}),
    },
    setupNodeEvents(on) {
      if (!primeAgentSocketPath || !workspacePath) {
        throw new Error("Prime Agent session seed configuration is incomplete")
      }
      on("task", {
        async seedPersistedPrimeAgentSession() {
          await seedPersistedPrimeAgentSession(primeAgentSocketPath, workspacePath)
          return null
        },
      })
      if (!browserUrl) {
        return
      }
      if (!hmrSentinelPath) {
        throw new Error("CYPRESS_hmrSentinelPath is required for browser integration")
      }
      if (!primeAgentAgentDir || !primeAgentCliPath || !primeAgentExecutablePath) {
        throw new Error("Prime Agent browser recovery configuration is incomplete")
      }
      on("task", {
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
        async stopExternalPrimeAgentDaemon() {
          await terminatePrimeAgentDaemonSupervisor(primeAgentSocketPath)
          return null
        },
        async writeBrowserHmrRevision(revision: string) {
          await writeFile(
            hmrSentinelPath,
            `/** Browser development revision used to prove Vite HMR through the stable gateway. */\nexport const browserHmrRevision = ${JSON.stringify(revision)}\n`,
          )
          return null
        },
      })
    },
    specPattern: browserUrl ? "e2e/browser.cy.ts" : "e2e/prime-agent.cy.ts",
    supportFile: "support/e2e.ts",
  },
  pageLoadTimeout: 30_000,
  retries: 0,
  screenshotOnRunFailure: true,
  screenshotsFolder: "screenshots",
  video: false,
  viewportHeight: 750,
  viewportWidth: 1100,
})
