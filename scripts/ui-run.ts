import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer, type ViteDevServer } from "vite"

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const cypressDirectory = join(projectDirectory, "cypress")
const ownedChildren = new Set<ChildProcess>()
let server: ViteDevServer | undefined
let cleanupPromise: Promise<void> | undefined

const cleanup = () => {
  cleanupPromise ??= Promise.all([...ownedChildren].map((child) => terminate(child)))
    .then(async () => server?.close())
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
  server = await createServer({
    configFile: join(projectDirectory, "vite.ui-lab.config.ts"),
    mode: "development",
    server: {
      host: "127.0.0.1",
      open: false,
      port: 0,
      strictPort: false,
    },
  })
  await server.listen()

  const uiLabUrl = server.resolvedUrls?.local[0]
  if (!uiLabUrl) throw new Error("Vite did not expose the Ernie UI lab URL")

  const cypressExecutable = join(cypressDirectory, "node_modules", ".bin", "cypress")
  const cypressArguments = process.argv.includes("--open")
    ? ["open", "--e2e", "--browser", "chrome"]
    : ["run", "--e2e", "--browser", "chrome"]

  await runChecked(cypressExecutable, cypressArguments, cypressDirectory, {
    ...process.env,
    CYPRESS_uiLabUrl: uiLabUrl,
  })
} finally {
  process.removeListener("SIGINT", handleSignal)
  process.removeListener("SIGTERM", handleSignal)
  await cleanup()
}

async function runChecked(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env,
    stdio: "inherit",
  })
  ownedChildren.add(child)
  child.once("exit", () => ownedChildren.delete(child))
  const [code, signal] = await once(child, "exit") as [number | null, NodeJS.Signals | null]
  if (code !== 0) {
    throw new Error(`${command} exited with ${code ?? signal ?? "an unknown status"}`)
  }
}

async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.pid === undefined) return

  sendSignal(child, "SIGTERM")
  await Promise.race([once(child, "exit"), delay(3_000)])
  if (child.exitCode === null) {
    sendSignal(child, "SIGKILL")
    await once(child, "exit").catch(() => undefined)
  }
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
