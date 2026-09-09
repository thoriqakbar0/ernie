import { Service } from "@zenbujs/core/runtime"
import { UpdaterService, RpcService } from "@zenbujs/core/services"
import { app, dialog } from "electron"
import { spawn } from "node:child_process"
import { rm, writeFile, readFile, access } from "node:fs/promises"
import fs from "node:fs"
import path from "node:path"
import { once } from "node:events"
import git from "isomorphic-git"
import { Effect, Schema } from "effect"
import { PreparedDependencies } from "../updates/preparation"
// @ts-expect-error The Node-only helper also runs outside the TypeScript service runtime.
import { installedSignature } from "../updates/dependency-signature.mjs"
import type { UpdateState } from "../../packages/updates"
import { inspectRelease, assertInstallationUnchanged, UpdateFailure } from "../updates/source"
import type { Candidate } from "../updates/source"

/** Owns update checks and staging; only an explicit native confirmation can restart Ernie. */
export class UpdatesService extends Service.create({
  deps: { rpc: RpcService, updater: UpdaterService },
  key: "updates",
}) {
  private currentState: UpdateState = { phase: "disabled" }
  private preparation = new PreparedDependencies()
  private get state(): UpdateState {
    return this.currentState
  }
  private set state(value: UpdateState) {
    this.currentState = value
    this.ctx.rpc.emit.app.updateStateChanged(value)
  }
  private candidate: Candidate | null = null
  private operation: Promise<UpdateState> | null = null
  private disposed = false
  private cancellation = new AbortController()

  /** Checks packaged installations at startup and every six hours; development stays disabled. */
  async evaluate() {
    const context = await this.ctx.updater.getAppContext()
    if (!context) {
      return
    }
    // The immutable recovery parent already owns the app lock. Its IPC child
    // must not compete for that same lock while loading the editable app.
    const recoveryChild =
      process.connected && process.argv.some((arg) => arg.startsWith("--ernie-history-child="))
    if (!recoveryChild && !app.requestSingleInstanceLock()) {
      app.quit()
      return
    }
    this.disposed = false
    this.cancellation = new AbortController()
    this.state = { phase: "idle" }
    try {
      const result = Schema.decodeUnknownSync(
        Schema.Struct({ outcome: Schema.Literals(["applied", "failed"]) }),
      )(JSON.parse(await readFile(`${context.appsDir}.update-result.json`, "utf-8")))
      await rm(`${context.appsDir}.update-result.json`)
      if (result.outcome === "failed") {
        this.state = {
          message:
            "Ernie could not finish applying the update. Review the release recovery guide before retrying.",
          phase: "error",
        }
      }
    } catch {
      /* No prior activation result is normal. */
    }
    const first = setTimeout(() => {
      if (this.state.phase !== "error") {
        void this.check()
      }
    }, 10_000)
    const timer = setInterval(
      () => {
        void this.check()
      },
      6 * 60 * 60 * 1000,
    )
    timer.unref()
    this.setup("update-checks", () => async () => {
      this.disposed = true
      this.cancellation.abort()
      clearTimeout(first)
      clearInterval(timer)
      await this.operation
      if (this.candidate) {
        await rm(this.candidate.directory, { force: true, recursive: true })
        this.candidate = null
      }
    })
  }

  /** Returns the latest public state without filesystem or network work. */
  status(): UpdateState {
    return this.state
  }

  private run(work: () => Promise<void>): Promise<UpdateState> {
    if (this.operation) {
      return this.operation
    }
    this.operation = (async () => {
      try {
        return await Effect.runPromise(
          Effect.tryPromise({
            catch: (cause) =>
              cause instanceof UpdateFailure
                ? cause
                : new UpdateFailure(
                    "The update could not finish. Check your connection, disk space, and installation, then try again.",
                  ),
            try: work,
          }).pipe(
            Effect.match({
              onFailure: (failure) => {
                this.state = { message: failure.message, phase: "error" }
                return this.state
              },
              onSuccess: () => this.state,
            }),
          ),
        )
      } finally {
        this.operation = null
      }
    })()
    return this.operation
  }

  /** Checks a separate clone; repeated requests share one operation. */
  check(): Promise<UpdateState> {
    if (this.state.phase === "restarting") {
      return Promise.resolve(this.state)
    }
    return this.run(async () => {
      const context = await this.ctx.updater.getAppContext()
      if (!context || this.disposed) {
        return
      }
      this.state = { phase: "checking" }
      const previous = this.candidate
      const candidate = await inspectRelease(context, this.cancellation.signal, previous)
      if (candidate !== previous) {
        this.preparation = new PreparedDependencies()
        if (previous) {
          await rm(previous.directory, { force: true, recursive: true })
        }
      }
      if (this.disposed) {
        if (candidate) {
          await rm(candidate.directory, { force: true, recursive: true })
        }
        return
      }
      this.candidate = candidate
      this.state = candidate
        ? { phase: "available", revision: candidate.revision, version: candidate.version }
        : { phase: "idle" }
    })
  }

  /** Stages dependencies and asks native confirmation before quitting. No renderer input selects source or paths. */
  apply(): Promise<UpdateState> {
    return this.run(async () => {
      const context = await this.ctx.updater.getAppContext()
      const { candidate } = this
      if (!context || !candidate || this.disposed) {
        return
      }
      this.state = { phase: "preparing" }
      await assertInstallationUnchanged(context, candidate)
      await this.preparation.ensure({
        install: () =>
          this.ctx.updater.install({
            dir: candidate.directory,
            pm: context.packageManager,
            resourcesPath: context.resourcesPath,
          }),
        installed: async () => {
          try {
            await access(path.join(candidate.directory, "node_modules"))
            return true
          } catch {
            return false
          }
        },
        signature: () =>
          this.ctx.updater.getDepsSignature({
            dir: candidate.directory,
            pm: context.packageManager,
          }),
      })
      await assertInstallationUnchanged(context, candidate)
      await assertInstallationUnchanged(
        { ...context, appsDir: candidate.directory },
        { ...candidate, currentRevision: candidate.revision },
      )
      if (this.disposed) {
        return
      }
      const answer = await dialog.showMessageBox({
        buttons: ["Cancel", "Update and restart"],
        cancelId: 0,
        defaultId: 0,
        detail:
          "Ernie will restart. Unsent drafts and reading positions will be cleared. Saved Agents and session files will be retained.",
        message: `Install Ernie ${candidate.version}?`,
        title: "Update Ernie",
        type: "question",
      })
      if (answer.response !== 1) {
        this.state = {
          phase: "available",
          revision: candidate.revision,
          version: candidate.version,
        }
        return
      }
      if (this.disposed) {
        return
      }
      // Native confirmation can remain open while installed or staged files change.
      await assertInstallationUnchanged(context, candidate)
      await assertInstallationUnchanged(
        { ...context, appsDir: candidate.directory },
        { ...candidate, currentRevision: candidate.revision },
      )
      await writeFile(
        path.join(candidate.directory, ".ernie-update-tracked.json"),
        JSON.stringify({
          dependencySignature: await installedSignature(
            candidate.directory,
            context.appsDir,
            context.packageManager,
            process.versions.electron ?? "no-electron",
          ),
          next: await git.listFiles({ dir: candidate.directory, fs }),
          old: await git.listFiles({ dir: context.appsDir, fs }),
        }),
      )
      const worker = spawn(
        process.execPath,
        [
          path.join(context.appsDir, "src/main/updates/apply.mjs"),
          context.appsDir,
          candidate.directory,
          `${context.appsDir}.rollback-${Date.now()}`,
          process.execPath,
          String(process.pid),
        ],
        {
          detached: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        },
      )
      const handshake = new AbortController()
      let handshakeFailure = new Error("Update helper failed")
      const timeout = setTimeout(() => {
        worker.kill()
        handshakeFailure = new Error("Update helper did not start")
        handshake.abort()
      }, 10_000)
      worker.once("error", () => {
        clearTimeout(timeout)
        handshakeFailure = new Error("Update helper failed")
        handshake.abort()
      })
      worker.once("exit", () => {
        clearTimeout(timeout)
        handshakeFailure = new Error("Update helper exited")
        handshake.abort()
        // A cancelled quit leaves this process alive until the helper times out.
        if (!this.disposed && this.state.phase === "restarting") {
          this.candidate = candidate
          this.state = {
            message: "Ernie did not restart. Close any pending dialogs and try the update again.",
            phase: "error",
          }
        }
      })
      let message: unknown
      try {
        ;[message] = await once(worker, "message", { signal: handshake.signal })
      } catch {
        throw handshakeFailure
      } finally {
        clearTimeout(timeout)
      }
      if (message !== "ready") {
        worker.kill()
        throw new Error("Invalid update helper handshake")
      }
      worker.disconnect()
      worker.unref()
      this.candidate = null
      this.state = { phase: "restarting" }
      app.quit()
    })
  }
}
