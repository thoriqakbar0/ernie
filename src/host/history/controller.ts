import { randomUUID } from "node:crypto"
import { mkdir, readFile, readdir, rm, statfs } from "node:fs/promises"
import { watch, type FSWatcher } from "node:fs"
import { join, resolve, isAbsolute } from "node:path"
import { Effect, Schema } from "effect"
import { Checkpoint, HistoryFailure, HistoryIndex, HistoryRequest } from "../../packages/app-history"
import { atomicWrite, failure, hashContent, SourceStore, permittedPath, sourceManifest } from "./source-store"

type Origin = Checkpoint["origin"]
type Activation = Readonly<{
  install: (directory: string) => Promise<void>
  open: (directory: string) => Promise<void>
  requestApproval: (proposalId: string) => void
}>
/** Bundle-only configuration never accepts a workspace supplied by an agent. */
export type HistoryConfig = Readonly<{
  home: string; initialSource: string; hostVersion: string; dataGeneration: number;
  managed: boolean; recoveryAvailable?: boolean; activation: Activation;
}>
/** Serializes all history mutations and owns watcher lifetime and restore authority. */
export class HistoryController {
  private index: HistoryIndex
  private readonly store: SourceStore
  private tail: Promise<unknown> = Promise.resolve()
  private readonly inactiveWatchers: FSWatcher[] = []
  private watcher?: FSWatcher
  private quiet?: ReturnType<typeof setTimeout>
  private interval?: ReturnType<typeof setInterval>
  private captureError?: HistoryFailure
  private constructor(private readonly config: HistoryConfig, index: HistoryIndex) {
    this.index = index
    this.store = new SourceStore(join(config.home, "objects"))
  }
  /** Opens a managed history store; development repositories cannot opt in through RPC. */
  static async open(config: HistoryConfig) {
    if (!config.managed || !isAbsolute(config.home) || !isAbsolute(config.initialSource)
      || resolve(config.home) === resolve(config.initialSource)
      || resolve(config.home).startsWith(resolve(config.initialSource) + "/")) {
      throw new HistoryFailure({ code: "unsupported_workspace", message: "App history requires an installed, managed Ernie workspace.", nextAction: "Open the installed Ernie app. Development repositories are not restored." })
    }
    await mkdir(config.home, { recursive: true, mode: 0o700 })
    const saved = await readFile(join(config.home, "index.json"), "utf8").catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    const index = saved ? Schema.decodeUnknownSync(HistoryIndex)(JSON.parse(saved)) : {
      version: 1 as const, checkpoints: [], operations: [], proposals: [], activeGeneration: config.initialSource,
    }
    const validGeneration = (path: string) => path === config.initialSource || (resolve(path).startsWith(resolve(config.home, "generations") + "/") && resolve(path).split("/").length === resolve(config.home, "generations").split("/").length + 1)
    if (!validGeneration(index.activeGeneration) || index.inactiveGenerations?.some(item => !validGeneration(item.path)) || index.proposals.some(item => item.previousGeneration && !validGeneration(item.previousGeneration))) throw new HistoryFailure({ code: "unsupported_workspace", message: "Saved generation is outside managed app storage.", nextAction: "Open independent recovery diagnostics." })
    const controller = new HistoryController(config, index)
    await controller.serial(async () => {
      // The durable pointer falls back before attempting an interrupted generation again.
      const interrupted = controller.index.proposals.findLast(item => item.state === "activating" || item.state === "opening")
      if (interrupted?.previousGeneration) controller.index = { ...controller.index, activeGeneration: interrupted.previousGeneration, currentCheckpointId: interrupted.previousCheckpointId }
      // An interrupted activation keeps its recovery checkpoint available to the host.
      controller.index = { ...controller.index, proposals: controller.index.proposals.map(proposal =>
        proposal.state === "activating" || proposal.state === "opening" ? { ...proposal, state: "failed" as const, error: "Opening was interrupted. Choose a recovery checkpoint." } : proposal) }
      try { await controller.capture(index.checkpoints.length ? "launch" : "baseline", index.checkpoints.length ? "Changes found on launch" : "Original app") }
      catch (error) { if (!index.checkpoints.length) throw error; controller.captureError = failure(error) }
      await controller.persist()
    })
    return controller
  }
  /** Host startup only: the selected generation survives ordinary relaunches. */
  get activeGeneration() { return this.index.activeGeneration }
  /** Opens the selected generation through the immutable host. */
  openCurrent() { return this.config.activation.open(this.index.activeGeneration) }
  /** A readiness handshake proves startup, not complete feature correctness. */
  async markKnownWorking() {
    return this.serial(async () => {
      const id = this.index.currentCheckpointId
      this.index = { ...this.index, lastKnownWorkingId: id, checkpoints: this.index.checkpoints.map(item => item.id === id ? { ...item, knownWorking: true } : item) }
      await this.persist()
    })
  }
  private serial<A>(operation: () => Promise<A>): Promise<A> {
    const next = this.tail.then(operation, operation)
    this.tail = next.then(() => undefined, () => undefined)
    return next
  }
  private persist() { return atomicWrite(join(this.config.home, "index.json"), JSON.stringify(this.index)) }
  private checkpoint(id: string) {
    const checkpoint = this.index.checkpoints.find(item => item.id === id)
    if (!checkpoint) throw new HistoryFailure({ code: "checkpoint_incomplete", message: "This checkpoint is unavailable.", nextAction: "Refresh app history and choose an available checkpoint." })
    return checkpoint
  }
  private compatible(checkpoint: Checkpoint) {
    return checkpoint.hostVersion === this.config.hostVersion && checkpoint.dataGeneration === this.config.dataGeneration
  }
  private assertIdle() {
    if (this.index.proposals.some(item => item.state === "activating" || item.state === "opening")) throw new HistoryFailure({ code: "active_customization", message: "A restore is opening Ernie.", nextAction: "Wait for recovery to finish before editing." })
  }
  private async capture(origin: Origin, title: string, operationId?: string, id: string = randomUUID()) {
    const captured = await Effect.runPromise(this.store.capture(this.index.activeGeneration))
    const same = this.index.checkpoints.find(item => item.tree === captured.tree && this.compatible(item))
    if (same) { this.captureError = undefined; this.index = { ...this.index, currentCheckpointId: same.id }; await this.persist(); return same }
    const checkpoint: Checkpoint = { ...captured, id, origin, title: title.slice(0, 200), operationId,
      createdAt: new Date().toISOString(), hostVersion: this.config.hostVersion, dataGeneration: this.config.dataGeneration,
      kept: origin === "manual", knownWorking: false }
    this.index = { ...this.index, checkpoints: [...this.index.checkpoints, checkpoint], currentCheckpointId: id }
    await this.persist()
    this.captureError = undefined
    await this.prune()
    return checkpoint
  }
  private async summary(checkpoint: Checkpoint, verified?: Map<string, number>) {
    let integrity = true
    try { await this.store.verify(checkpoint, verified) } catch { integrity = false }
    const { files, ...metadata } = checkpoint
    const position = this.index.checkpoints.findIndex(item => item.id === checkpoint.id)
    const previous = this.index.checkpoints[position - 1]
    const before = new Map(previous?.files.map(file => [file.path, file]))
    const after = new Map(files.map(file => [file.path, file]))
    const changedFileCount = [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path)?.hash !== after.get(path)?.hash || before.get(path)?.executable !== after.get(path)?.executable).length
    return { ...metadata, complete: integrity, changedFileCount, proposedTitle: checkpoint.operationId ? checkpoint.title : null, fileCount: files.length, restorable: integrity && this.compatible(checkpoint),
      reason: !integrity ? "checkpoint_incomplete" : this.compatible(checkpoint) ? null : "checkpoint_incompatible" }
  }
  /** Public calls share validation, serialization, and bounded presentation. */
  request(raw: unknown) {
    return Effect.tryPromise({ try: async () => {
      let request: HistoryRequest
      try { request = Schema.decodeUnknownSync(HistoryRequest)(raw) }
      catch { throw new HistoryFailure({ code: "invalid_request", message: "Invalid protocol 1 request.", nextAction: "Consult the Editing Ernie guide for command arguments." }) }
      if (request.method === "customization.begin" || request.method === "customization.finish" || request.method === "history.checkpoint" || request.method === "history.prepare_restore") this.assertIdle()
      // Progress reads do not wait behind a dependency install or readiness handshake.
      if (request.method === "history.operation_status") {
        const operation = this.index.proposals.find(item => item.id === request.operationId) ?? this.index.operations.find(item => item.id === request.operationId)
        if (!operation) throw new HistoryFailure({ code: "invalid_request", message: "Operation not found.", nextAction: "Read history.status for active operations." })
        return operation
      }
      return this.serial(async () => {
      switch (request.method) {
        case "history.open": this.config.activation.requestApproval(""); return { opened: true }
        case "history.status": {
          const current = await Effect.runPromise(this.store.capture(this.index.activeGeneration)).catch(error => { this.captureError = failure(error); return undefined })
          const checkpoint = this.index.checkpoints.find(item => item.tree === current?.tree)
          return { version: 1, recoveryAvailable: this.config.recoveryAvailable === true, workspace: this.index.activeGeneration, currentCheckpointId: checkpoint?.id ?? null,
            unsavedChanges: current ? !checkpoint : null, captureError: this.captureError ?? null,
            operations: this.index.operations.filter(item => item.state === "editing"), hostVersion: this.config.hostVersion,
            dataGeneration: this.config.dataGeneration, lastRecoveryId: this.index.lastRecoveryId ?? null, inactiveGenerations: this.index.inactiveGenerations ?? [], pendingProposals: this.index.proposals.filter(item => item.state === "awaiting_confirmation") }
        }
        case "history.list": {
          const sorted = [...this.index.checkpoints].reverse()
          const start = request.cursor ? sorted.findIndex(item => item.id === request.cursor) : 0
          if (start < 0) throw new HistoryFailure({ code: "invalid_request", message: "History pagination changed.", nextAction: "Restart the history listing." })
          const items = []
          const verified = new Map<string, number>()
          for (const item of sorted.slice(start, start + 30)) items.push(await this.summary(item, verified))
          return { items, cursor: sorted[start + 30]?.id ?? null }
        }
        case "history.inspect": return this.summary(this.checkpoint(request.checkpointId))
        case "history.diff": {
          const checkpoint = this.checkpoint(request.checkpointId)
          const current = request.againstCheckpointId ? this.checkpoint(request.againstCheckpointId) : await Effect.runPromise(this.store.capture(this.index.activeGeneration))
          if (request.expectedTree && request.expectedTree !== current.tree) throw new HistoryFailure({ code: "invalid_request", message: "The source changed between diff pages.", nextAction: "Read the diff again from its first page." })
          const old = new Map(checkpoint.files.map(file => [file.path, file]))
          const now = new Map(current.files.map(file => [file.path, file]))
          const paths = [...new Set([...old.keys(), ...now.keys()])].sort().filter(path => old.get(path)?.hash !== now.get(path)?.hash || old.get(path)?.executable !== now.get(path)?.executable)
          if (request.path) {
            if (!paths.includes(request.path)) throw new HistoryFailure({ code: "invalid_request", message: "This file is not in the change set.", nextAction: "Refresh the changed files." })
            const read = async (hash?: string) => {
              if (!hash) return null
              const bytes = await this.store.bytes(hash)
              return bytes.includes(0) ? { binary: true, size: bytes.length } : { binary: false, text: bytes.toString("utf8").slice(request.offset ?? 0, (request.offset ?? 0) + 16000), truncated: bytes.toString("utf8").length > (request.offset ?? 0) + 16000, nextOffset: bytes.toString("utf8").length > (request.offset ?? 0) + 16000 ? (request.offset ?? 0) + 16000 : null, size: bytes.length }
            }
            return { path: request.path, currentTree: current.tree, sourceContent: true, before: await read(old.get(request.path)?.hash), current: await read(now.get(request.path)?.hash) }
          }
          let start = 0
          if (request.cursor) {
            let page
            try { page = Schema.decodeUnknownSync(Schema.Struct({ tree: Schema.String, base: Schema.String, path: Schema.String }))(JSON.parse(Buffer.from(request.cursor, "base64url").toString("utf8"))) }
            catch { throw new HistoryFailure({ code: "invalid_request", message: "Invalid diff cursor.", nextAction: "Restart the diff listing." }) }
            if (page.tree !== current.tree || page.base !== checkpoint.tree) throw new HistoryFailure({ code: "invalid_request", message: "Source changed between diff pages.", nextAction: "Restart the diff listing." })
            start = paths.indexOf(page.path)
          }
          if (start < 0) throw new HistoryFailure({ code: "invalid_request", message: "The diff changed.", nextAction: "Refresh the diff." })
          return { items: paths.slice(start, start + 50).map(path => ({ path, change: !old.has(path) ? "added" : !now.has(path) ? "deleted" : "modified" })), cursor: paths[start + 50] ? Buffer.from(JSON.stringify({ tree: current.tree, base: checkpoint.tree, path: paths[start + 50] })).toString("base64url") : null, currentTree: current.tree, total: paths.length }
        }
        case "history.checkpoint": {
          this.assertIdle()
          const id = `manual-${hashContent(request.requestId)}`
          const receipt = this.index.receipts?.[id]
          const existing = receipt ? this.checkpoint(receipt) : undefined
          const saved = existing ?? await this.capture("manual", request.title, undefined, id)
          this.index = { ...this.index, receipts: { ...this.index.receipts, [id]: saved.id }, checkpoints: this.index.checkpoints.map(item => item.id === saved.id ? { ...item, kept: true } : item) }
          await this.persist()
          return this.summary(this.checkpoint(saved.id))
        }
        case "history.keep": {
          this.checkpoint(request.checkpointId)
          this.index = { ...this.index, checkpoints: this.index.checkpoints.map(item => item.id === request.checkpointId ? { ...item, kept: request.kept } : item) }
          await this.persist(); return { kept: request.kept }
        }
        case "customization.begin": {
          if (!this.config.recoveryAvailable) throw new HistoryFailure({ code: "history_unavailable", message: "Independent recovery is not available.", nextAction: "Open the installed recovery-capable desktop build before customizing Ernie." })
          this.assertIdle()
          const id = `edit-${hashContent(request.requestId)}`
          const existing = this.index.operations.find(item => item.id === id)
          if (existing) return existing
          const checkpoint = await this.capture("customization", "Before customization", id)
          const overlapping = this.index.operations.some(item => item.state === "editing")
          const operation = { id, baselineId: checkpoint.id, workspace: this.index.activeGeneration, startedAt: new Date().toISOString(), state: "editing" as const, overlapping }
          this.index = { ...this.index, operations: [...this.index.operations.map(item => item.state === "editing" ? { ...item, overlapping: true } : item), operation] }
          await this.persist(); return { ...operation, workspace: this.index.activeGeneration }
        }
        case "customization.finish": {
          const operation = this.index.operations.find(item => item.id === request.operationId)
          if (!operation) throw new HistoryFailure({ code: "invalid_request", message: "Customization operation not found.", nextAction: "Read history.status and use its operation ID." })
          if (operation.state === "finished") return operation
          const checkpoint = await this.capture("customization", request.summary, operation.id)
          const finished = { ...operation, state: "finished" as const, checkpointId: checkpoint.id }
          this.index = { ...this.index, operations: this.index.operations.map(item => item.id === operation.id ? finished : item) }
          await this.persist(); return finished
        }
        case "history.prepare_restore": {
          this.assertIdle()
          const id = `restore-${hashContent(request.requestId)}`
          const existing = this.index.proposals.find(item => item.id === id)
          if (existing) {
            if (existing.checkpointId !== request.checkpointId) throw new HistoryFailure({ code: "invalid_request", message: "This request ID belongs to another checkpoint.", nextAction: "Use a fresh request ID for a different restore." })
            return existing
          }
          const checkpoint = this.checkpoint(request.checkpointId)
          if (!this.compatible(checkpoint)) throw new HistoryFailure({ code: "checkpoint_incompatible", message: "This checkpoint requires another host or data generation.", nextAction: "Choose a compatible checkpoint." })
          if (this.index.operations.some(item => item.state === "editing")) throw new HistoryFailure({ code: "active_customization", message: "Customization is still active.", nextAction: "Finish editing before restoring." })
          await this.store.verify(checkpoint)
          const current = await Effect.runPromise(this.store.capture(this.index.activeGeneration))
          const proposal = { id, checkpointId: checkpoint.id, currentTree: current.tree, state: "awaiting_confirmation" as const }
          this.index = { ...this.index, proposals: [...this.index.proposals, proposal] }
          await this.persist(); return proposal
        }
        case "history.request_restore": {
          const proposal = this.index.proposals.find(item => item.id === request.proposalId)
          if (!proposal || proposal.state !== "awaiting_confirmation") throw new HistoryFailure({ code: "proposal_stale", message: "This proposal is no longer awaiting approval.", nextAction: "Prepare another restore." })
          this.config.activation.requestApproval(proposal.id)
          return { code: "approval_required", proposalId: proposal.id, message: "Approve this restore in Ernie’s recovery window." }
        }
      }
    }) }, catch: failure })
  }
  /** New desktop builds offer their bundled official source through the same review flow. */
  async prepareOfficialUpdate(source: string) {
    const checkpoint = await this.serial(async () => {
      this.assertIdle()
      if (this.index.operations.some(item => item.state === "editing")) throw new HistoryFailure({ code: "active_customization", message: "Customization is still active.", nextAction: "Finish editing before installing an official update." })
      await this.capture("official_update", "Before official update")
      const captured = await Effect.runPromise(this.store.capture(source))
      const previous = this.index.checkpoints.find(item => item.tree === captured.tree && this.compatible(item))
      if (previous) return previous
      const checkpoint: Checkpoint = { ...captured, id: randomUUID(), createdAt: new Date().toISOString(), origin: "official_update", title: "Official Ernie update", hostVersion: this.config.hostVersion, dataGeneration: this.config.dataGeneration, knownWorking: false, kept: false }
      this.index = { ...this.index, checkpoints: [...this.index.checkpoints, checkpoint] }
      await this.persist()
      return checkpoint
    })
    return Effect.runPromise(this.request({ method: "history.prepare_restore", checkpointId: checkpoint.id, requestId: randomUUID() }))
  }
  /** Immutable host uses factual checkpoint identity in its native confirmation. */
  review(proposalId: string) {
    const proposal = this.index.proposals.find(item => item.id === proposalId && item.state === "awaiting_confirmation")
    if (!proposal) throw new HistoryFailure({ code: "proposal_stale", message: "The proposal is no longer available.", nextAction: "Prepare a new restore proposal." })
    const checkpoint = this.checkpoint(proposal.checkpointId)
    return { checkpointId: checkpoint.id, createdAt: checkpoint.createdAt, fileCount: checkpoint.files.length }
  }
  /** Called only by bundled host approval UI; never exported as a public agent command. */
  approve(proposalId: string) {
    return this.serial(async () => {
      const proposal = this.index.proposals.find(item => item.id === proposalId)
      if (!proposal || proposal.state !== "awaiting_confirmation") throw new HistoryFailure({ code: "proposal_stale", message: "Restore proposal expired.", nextAction: "Review a fresh proposal." })
      if (this.index.operations.some(item => item.state === "editing")) throw new HistoryFailure({ code: "active_customization", message: "An editing operation started.", nextAction: "Finish editing and prepare another restore." })
      const current = await Effect.runPromise(this.store.capture(this.index.activeGeneration))
      if (current.tree !== proposal.currentTree) throw new HistoryFailure({ code: "proposal_stale", message: "Application files changed after review.", nextAction: "Review a fresh restore proposal." })
      const target = this.checkpoint(proposal.checkpointId)
      if (!this.compatible(target)) throw new HistoryFailure({ code: "checkpoint_incompatible", message: "Checkpoint compatibility changed.", nextAction: "Choose a compatible checkpoint." })
      await this.store.verify(target)
      const disk = await statfs(this.config.home)
      if (disk.bavail * disk.bsize < target.files.reduce((size, file) => size + file.size, 0) * 2 + 128 * 1024 ** 2) throw new HistoryFailure({ code: "storage_limit", message: "Not enough space to prepare recovery.", nextAction: "Free disk space and prepare a new proposal." })
      const previous = await this.capture("before_restore", "Before restoring checkpoint")
      const generation = join(this.config.home, "generations", randomUUID())
      await mkdir(join(this.config.home, "generations"), { recursive: true })
      const update = async (state: "activating" | "opening" | "complete" | "failed", error?: string) => {
        this.index = { ...this.index, proposals: this.index.proposals.map(item => item.id === proposalId ? { ...item, state, error, previousGeneration: oldGeneration, previousCheckpointId: previous.id } : item), lastRecoveryId: previous.id }
        await this.persist()
      }
      const oldGeneration = this.index.activeGeneration
      try {
        await update("activating")
        await this.store.materialize(target, generation)
        await this.config.activation.install(generation).catch(() => { throw new HistoryFailure({ code: "dependency_failed", message: "Locked dependencies could not be prepared.", nextAction: "Check connectivity and retry from a new restore proposal." }) })
        const latest = await Effect.runPromise(this.store.capture(oldGeneration))
        if (latest.tree !== proposal.currentTree) throw new HistoryFailure({ code: "proposal_stale", message: "Files changed during preparation.", nextAction: "Stop external editing and review again." })
        this.index = { ...this.index, activeGeneration: generation, currentCheckpointId: target.id, inactiveGenerations: [...(this.index.inactiveGenerations ?? []).filter(item => item.path !== oldGeneration && item.path !== generation), { path: oldGeneration, tree: current.tree, changed: false }] }
        await update("opening")
        await this.config.activation.open(generation)
        this.index = { ...this.index, lastKnownWorkingId: target.id, checkpoints: this.index.checkpoints.map(item => item.id === target.id ? { ...item, knownWorking: true } : item) }
        await update("complete")
        this.startWatching()
      } catch (error) {
        this.index = { ...this.index, activeGeneration: oldGeneration, currentCheckpointId: previous.id, inactiveGenerations: this.index.inactiveGenerations?.filter(item => item.path !== oldGeneration) }
        await update("failed", "Restore could not open. The previous application generation is preserved.")
        if (this.index.proposals.find(item => item.id === proposalId)?.previousGeneration) await this.config.activation.open(oldGeneration).catch(() => {})
        this.startWatching()
        throw error
      }
      return { state: "complete", checkpointId: target.id, previousCheckpointId: previous.id }
    })
  }
  /** Watcher and timer are owned by the host lifetime; failures surface through status. */
  startWatching() {
    this.stopWatching()
    let revision = 0
    let capturedRevision = 0
    const capture = () => { if (revision === capturedRevision) return; const started = revision; void this.serial(async () => {
      this.assertIdle()
      await this.capture("external", "External changes")
      capturedRevision = started
    }).catch(error => { this.captureError = failure(error) }) }
    this.watcher = watch(this.index.activeGeneration, { recursive: true }, (_event, filename) => {
      if (!filename || (!permittedPath(filename) && !sourceManifest.directories.some(directory => directory === filename || directory.startsWith(`${filename}/`)))) return
      revision++
      if (this.quiet) clearTimeout(this.quiet)
      this.quiet = setTimeout(capture, 3000)
    })
    this.watcher.on("error", error => { this.captureError = failure(error) })
    for (const generation of this.index.inactiveGenerations ?? []) {
      const markChanged = () => { if (this.index.inactiveGenerations?.find(item => item.path === generation.path)?.changed) return; void this.serial(async () => {
        this.index = { ...this.index, inactiveGenerations: this.index.inactiveGenerations?.map(item => item.path === generation.path ? { ...item, changed: true } : item) }
        await this.persist()
      }).catch(error => { this.captureError = failure(error) }) }
      try {
        const watcher = watch(generation.path, { recursive: true }, (_event, filename) => { if (filename && permittedPath(filename)) markChanged() })
        watcher.on("error", markChanged)
        this.inactiveWatchers.push(watcher)
      } catch { markChanged() }
    }
    this.interval = setInterval(capture, 30000)
    this.interval.unref()
  }
  /** Stops all capture resources without deleting history or application source. */
  stopWatching() {
    for (const watcher of this.inactiveWatchers.splice(0)) watcher.close()
    this.watcher?.close(); this.watcher = undefined
    if (this.quiet) clearTimeout(this.quiet)
    if (this.interval) clearInterval(this.interval)
  }
  private async prune() {
    const protectedIds = new Set([this.index.checkpoints[0]?.id, this.index.currentCheckpointId, this.index.lastKnownWorkingId, this.index.lastRecoveryId,
      ...this.index.operations.filter(item => item.state === "editing").map(item => item.baselineId),
      ...this.index.proposals.filter(item => item.state === "awaiting_confirmation").map(item => item.checkpointId)])
    const keep = [...this.index.checkpoints]
    let automatic = keep.filter(item => !item.kept).length
    const size = () => { const objects = new Map(keep.flatMap(item => item.files.map(file => [file.hash, file.size] as const))); return [...objects.values()].reduce((a, b) => a + b, 0) }
    for (const checkpoint of [...keep]) {
      if (automatic <= 100 && size() <= 1024 ** 3) break
      if (checkpoint.kept || protectedIds.has(checkpoint.id)) continue
      keep.splice(keep.indexOf(checkpoint), 1); automatic--
    }
    this.index = { ...this.index, checkpoints: keep }; await this.persist()
    const referenced = new Set(keep.flatMap(item => item.files.map(file => file.hash)))
    for (const object of await readdir(join(this.config.home, "objects"))) {
      if (/^[a-f0-9]{64}$/.test(object) && !referenced.has(object)) await rm(join(this.config.home, "objects", object))
    }
    if (size() > 1024 ** 3) this.captureError = new HistoryFailure({ code: "storage_limit", message: "Protected history exceeds the storage budget.", nextAction: "Review kept checkpoints to free history storage." })
  }
}
