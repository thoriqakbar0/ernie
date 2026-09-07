import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { HistoryController } from "../host/history/controller"
import { sourceManifest } from "../host/history/source-store"
import { serveHistory } from "../host/history/transport"
import { admitHistoryTurn } from "../main/prime-agent/history-admission"

// Exercise admission through the real authenticated controller, using only disposable app source.
test("admission rejects the original app root after activation and accepts the current generation", async () => {
  const root = await mkdtemp("/tmp/ernie-admit-")
  const source = path.join(root, "source")
  const home = path.join(root, "history")
  const keys = ["ERNIE_HISTORY_HOME", "ERNIE_MANAGED_SOURCE", "ERNIE_INITIAL_SOURCE"] as const
  const previous = keys.map((key) => [key, process.env[key]] as const)
  let closeServer: (() => Promise<void>) | undefined
  let controller: HistoryController | undefined
  try {
    await mkdir(path.join(source, "src"), { recursive: true })
    await Promise.all(
      sourceManifest.required.map((file) => writeFile(path.join(source, file), "{}")),
    )
    await writeFile(path.join(source, "src", "app.ts"), "original")
    controller = await HistoryController.open({
      activation: { install: async () => {}, open: async () => {}, requestApproval: () => {} },
      dataGeneration: 1,
      home,
      hostVersion: "test",
      initialSource: source,
      managed: true,
      recoveryAvailable: true,
    })
    closeServer = await serveHistory(controller, home)
    process.env.ERNIE_HISTORY_HOME = home
    process.env.ERNIE_MANAGED_SOURCE = source
    process.env.ERNIE_INITIAL_SOURCE = source
    const admitted = await admitHistoryTurn(source, "initial-turn")
    assert.ok(admitted)
    await admitted.finish()
    const status = Schema.decodeUnknownSync(Schema.Struct({ currentCheckpointId: Schema.String }))(
      await Effect.runPromise(controller.request({ method: "history.status" })),
    )
    const proposal = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(
      await Effect.runPromise(
        controller.request({
          checkpointId: status.currentCheckpointId,
          method: "history.prepare_restore",
          requestId: "restore",
        }),
      ),
    )
    await controller.approve(proposal.id)
    await assert.rejects(admitHistoryTurn(source, "stale-turn"), /inactive app generation/u)
    const afterRejection = Schema.decodeUnknownSync(
      Schema.Struct({ operations: Schema.Array(Schema.Unknown) }),
    )(await Effect.runPromise(controller.request({ method: "history.status" })))
    assert.equal(afterRejection.operations.length, 0)
    process.env.ERNIE_MANAGED_SOURCE = controller.activeGeneration
    const current = await admitHistoryTurn(controller.activeGeneration, "current-turn")
    assert.ok(current)
    await current.finish()
    assert.equal(
      await admitHistoryTurn(path.join(root, "unrelated-project"), "unprotected-turn"),
      undefined,
    )
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        if (key === "ERNIE_HISTORY_HOME") {
          delete process.env.ERNIE_HISTORY_HOME
        } else if (key === "ERNIE_MANAGED_SOURCE") {
          delete process.env.ERNIE_MANAGED_SOURCE
        } else {
          delete process.env.ERNIE_INITIAL_SOURCE
        }
      } else {
        process.env[key] = value
      }
    }
    controller?.stopWatching()
    await closeServer?.()
    await rm(root, { force: true, recursive: true })
  }
})
