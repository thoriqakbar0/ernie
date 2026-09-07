import { execFile, spawn } from "node:child_process"
import type { ChildProcess } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { gte, valid } from "semver"

const execute = promisify(execFile)
type LaunchFailure = Readonly<{
  status: "not-installed" | "incompatible" | "failed"
  error: string
}>

/** Probe transport absence without treating handshake, permission, or timeout failures as permission to launch. */
export const isPrimeDaemonAbsent = (socketPath: string): Promise<boolean> => {
  const pending = Promise.withResolvers<boolean>()
  const socket = createConnection(socketPath)
  const timer = setTimeout(() => {
    socket.destroy()
    pending.resolve(false)
  }, 500)
  const finish = (absent: boolean) => {
    clearTimeout(timer)
    socket.destroy()
    pending.resolve(absent)
  }
  socket.once("connect", () => finish(false))
  socket.once("error", (error: NodeJS.ErrnoException) =>
    finish(error.code === "ENOENT" || error.code === "ECONNREFUSED"),
  )
  return pending.promise
}

/** Launches only a discovered user installation; upstream owns the daemon socket lock and process lifetime. */
export class InstalledPrimeDaemon {
  private child: ChildProcess | undefined
  private failed = false
  private readonly environment: NodeJS.ProcessEnv
  private readonly candidates: readonly string[]

  constructor(environment: NodeJS.ProcessEnv = process.env, home = homedir()) {
    // GUI launches may have a minimal PATH. Never search project-local node_modules/.bin or the current directory.
    const directories = [
      ...new Set([
        ...(environment.PATH ?? "").split(path.delimiter),
        path.join(home, ".local", "bin"),
        path.join(home, ".npm-global", "bin"),
        path.join(home, "Library", "pnpm"),
        path.join(home, ".bun", "bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ]),
    ].filter(
      (directory) =>
        path.isAbsolute(directory) && !directory.split(path.sep).includes("node_modules"),
    )
    this.environment = Object.fromEntries(
      Object.entries(environment).filter(
        ([key]) =>
          !key.startsWith("PRIME_AGENT_INTERNAL_") &&
          key !== "NODE_OPTIONS" &&
          key !== "ELECTRON_RUN_AS_NODE",
      ),
    )
    this.environment.PATH = directories.join(path.delimiter)
    this.candidates =
      environment.ERNIE_PRIME_AGENT_EXECUTABLE === undefined
        ? directories.map((directory) => path.join(directory, "prime-agent"))
        : [environment.ERNIE_PRIME_AGENT_EXECUTABLE]
  }

  /** Whether the last launched process exited or failed; no raw process output is exposed. */
  get exited() {
    return (
      this.failed ||
      (this.child !== undefined && (this.child.exitCode !== null || this.child.signalCode !== null))
    )
  }

  /** Starts daemon mode once per live child, with a bounded version probe and no shell or package runner. */
  async start(
    socketPath: string,
    shouldStop: () => boolean = () => false,
  ): Promise<LaunchFailure | Readonly<{ status: "started" }>> {
    if (this.child && !this.exited) {
      return { status: "started" }
    }
    const executable = await this.findExecutable(0)
    if (shouldStop()) {
      return { error: "Ernie is shutting down.", status: "failed" }
    }
    if (!executable) {
      return {
        error:
          "Prime Agent was not found. Install it yourself, or set ERNIE_PRIME_AGENT_EXECUTABLE to its absolute executable path, then retry.",
        status: "not-installed",
      }
    }
    try {
      const { stdout, stderr } = await execute(executable, ["--version"], {
        env: this.environment,
        maxBuffer: 1024,
        timeout: 3000,
      })
      // Prime Agent redirects console.log to stderr in its CLI entrypoint.
      const version = valid(stdout.trim() || stderr.trim())
      if (!version || !gte(version, "0.9.3")) {
        return {
          error:
            "Starting Prime Agent requires an installed version 0.9.3 or newer. Update it yourself, then retry.",
          status: "incompatible",
        }
      }
    } catch {
      return {
        error:
          "The installed Prime Agent executable could not run --version. Check its runtime and ERNIE_PRIME_AGENT_EXECUTABLE, then retry.",
        status: "failed",
      }
    }
    if (shouldStop()) {
      return { error: "Ernie is shutting down.", status: "failed" }
    }
    this.failed = false
    const child = spawn(executable, ["--mode", "daemon", "--daemon-socket", socketPath], {
      cwd: homedir(),
      detached: true,
      env: this.environment,
      stdio: "ignore",
    })
    this.child = child
    const pendingSpawn = Promise.withResolvers<boolean>()
    child.once("error", () => {
      this.failed = true
      pendingSpawn.resolve(false)
    })
    child.once("spawn", () => pendingSpawn.resolve(true))
    const started = await pendingSpawn.promise
    child.unref()
    return started
      ? { status: "started" }
      : {
          error:
            "Prime Agent could not start. Check the installed executable and its daemon logs, then retry.",
          status: "failed",
        }
  }

  private async findExecutable(index: number): Promise<string | undefined> {
    const candidate = this.candidates[index]
    if (candidate === undefined) {
      return undefined
    }
    if (path.isAbsolute(candidate)) {
      try {
        await access(candidate, constants.X_OK)
        return candidate
      } catch {
        // Continue only through the bounded discovery list; an explicit override never falls back.
      }
    }
    return this.findExecutable(index + 1)
  }
}
