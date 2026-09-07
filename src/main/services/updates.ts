import { Service } from "@zenbujs/core/runtime"
import { UpdaterService } from "@zenbujs/core/services"
import { app, dialog } from "electron"
import { spawn } from "node:child_process"
import { rm, writeFile, readFile } from "node:fs/promises"
import fs from "node:fs"
import { join } from "node:path"
import git from "isomorphic-git"
import { Effect, Schema } from "effect"
import type { UpdateState } from "../../packages/updates"
import { inspectRelease, assertInstallationUnchanged, UpdateFailure, type Candidate } from "../updates/source"

/** Owns update checks and staging; only an explicit native confirmation can restart Ernie. */
export class UpdatesService extends Service.create({ key: "updates", deps: { updater: UpdaterService } }) {
  private state: UpdateState = { phase: "disabled" }
  private candidate: Candidate | null = null
  private operation: Promise<UpdateState> | null = null
  private disposed = false
  private cancellation = new AbortController()

  /** Checks packaged installations at startup and every six hours; development stays disabled. */
  async evaluate() {
    const context = await this.ctx.updater.getAppContext()
    if (!context) return
    if (!app.requestSingleInstanceLock()) { app.quit(); return }
    this.disposed = false
    this.cancellation = new AbortController()
    this.state = { phase: "idle" }
    try {
      const result = Schema.decodeUnknownSync(Schema.Struct({ outcome: Schema.Literals(["applied", "failed"]) }))(JSON.parse(await readFile(`${context.appsDir}.update-result.json`, "utf8")))
      await rm(`${context.appsDir}.update-result.json`)
      if (result.outcome === "failed") this.state = { phase: "error", message: "Ernie could not finish applying the update. Review the release recovery guide before retrying." }
    } catch { /* No prior activation result is normal. */ }
    const first = setTimeout(() => { if (this.state.phase !== "error") void this.check() }, 10_000)
    const timer = setInterval(() => { void this.check() }, 6 * 60 * 60 * 1000)
    timer.unref()
    this.setup("update-checks", () => async () => {
      this.disposed = true; this.cancellation.abort(); clearTimeout(first); clearInterval(timer)
      await this.operation
      if (this.candidate) { await rm(this.candidate.directory, { recursive: true, force: true }); this.candidate = null }
    })
  }

  /** Returns the latest public state without filesystem or network work. */
  status(): UpdateState { return this.state }

  private run(work: () => Promise<void>): Promise<UpdateState> {
    if (this.operation) return this.operation
    this.operation = Effect.runPromise(Effect.tryPromise({ try: work, catch: (cause) => cause instanceof UpdateFailure ? cause : new UpdateFailure("The update could not finish. Check your connection, disk space, and installation, then try again.") }).pipe(
      Effect.catch((failure) => Effect.sync(() => { this.state = { phase: "error", message: failure.message } })),
    )).then(() => this.state).finally(() => { this.operation = null })
    return this.operation
  }

  /** Checks a separate clone; repeated requests share one operation. */
  check(): Promise<UpdateState> {
    return this.run(async () => {
      const context = await this.ctx.updater.getAppContext()
      if (!context || this.disposed) return
      this.state = { phase: "checking" }
      if (this.candidate) { await rm(this.candidate.directory, { recursive: true, force: true }); this.candidate = null }
      const candidate = await inspectRelease(context, this.cancellation.signal)
      if (this.disposed) { if (candidate) await rm(candidate.directory, { recursive: true, force: true }); return }
      this.candidate = candidate
      this.state = candidate ? { phase: "available", version: candidate.version, revision: candidate.revision } : { phase: "idle" }
    })
  }

  /** Stages dependencies and asks native confirmation before quitting. No renderer input selects source or paths. */
  apply(): Promise<UpdateState> {
    return this.run(async () => {
      const context = await this.ctx.updater.getAppContext()
      const candidate = this.candidate
      if (!context || !candidate || this.disposed) return
      this.state = { phase: "preparing" }
      await assertInstallationUnchanged(context, candidate)
      await this.ctx.updater.install({ dir: candidate.directory, resourcesPath: context.resourcesPath, pm: context.packageManager })
      await assertInstallationUnchanged(context, candidate)
      await assertInstallationUnchanged({ ...context, appsDir: candidate.directory }, { ...candidate, currentRevision: candidate.revision })
      if (this.disposed) return
      const answer = await dialog.showMessageBox({ type: "question", buttons: ["Cancel", "Update and restart"], defaultId: 0, cancelId: 0,
        title: "Update Ernie", message: `Install Ernie ${candidate.version}?`, detail: "Ernie will restart. Unsent drafts and reading positions will be cleared. Saved Agents and session files will be retained." })
      if (answer.response !== 1) { this.state = { phase: "available", version: candidate.version, revision: candidate.revision }; return }
      await writeFile(join(candidate.directory, ".ernie-update-tracked.json"), JSON.stringify({ old: await git.listFiles({ fs, dir: context.appsDir }), next: await git.listFiles({ fs, dir: candidate.directory }) }))
      const worker = spawn(process.execPath, [join(context.appsDir, "src/main/updates/apply.mjs"), context.appsDir, candidate.directory,
        `${context.appsDir}.rollback-${Date.now()}`, process.execPath, String(process.pid)], { detached: true, stdio: ["ignore", "ignore", "ignore", "ipc"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } })
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { worker.kill(); reject(new Error("Update helper did not start")) }, 10_000)
        worker.once("error", () => { clearTimeout(timeout); reject(new Error("Update helper failed")) })
        worker.once("exit", () => { clearTimeout(timeout); reject(new Error("Update helper exited")) })
        worker.once("message", (message: unknown) => {
          clearTimeout(timeout)
          if (message !== "ready") { worker.kill(); reject(new Error("Invalid update helper handshake")); return }
          worker.disconnect(); resolve()
        })
      })
      worker.unref()
      this.candidate = null
      this.state = { phase: "restarting" }
      app.quit()
    })
  }
}
