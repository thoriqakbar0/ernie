import { Worker } from "node:worker_threads"
import { Schema } from "effect"
import type { PrimeModel } from "../../packages/prime-agent"

const modelsSchema = Schema.Array(Schema.Struct({
  id: Schema.String,
  provider: Schema.String,
  label: Schema.String,
  cost: Schema.Struct({ input: Schema.Number, output: Schema.Number }),
  available: Schema.Boolean,
}))

// Prime Agent's registry performs synchronous file reads. Isolate those reads
// and catalog construction from the host event loop; return metadata only.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { AuthStorage, ModelRegistry } = await import(workerData.moduleUrl);
  const registry = ModelRegistry.create(AuthStorage.create());
  const configured = registry.getAvailable();
  const available = new Set(configured.map(model => model.provider + ':' + model.id));
  parentPort.postMessage((workerData.all ? registry.getAll() : configured).map(model => ({
    id: model.id, provider: model.provider, label: model.name ?? model.id,
    cost: { input: model.cost.input, output: model.cost.output },
    available: available.has(model.provider + ':' + model.id)
  })));
})().catch(() => process.exit(1));
`

const pending = new Map<boolean, Promise<readonly PrimeModel[]>>()
export function readModelCatalog(all = false): Promise<readonly PrimeModel[]> {
  const existing = pending.get(all)
  if (existing) return existing
  const request = new Promise<readonly PrimeModel[]>((resolve, reject) => {
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { all, moduleUrl: import.meta.resolve("prime-agent") },
      execArgv: [],
    })
    const timer = setTimeout(() => {
      reject(new Error("Model catalog timed out. Try again."))
      void worker.terminate().catch(() => {})
    }, 15_000)
    worker.once("message", (value: unknown) => {
      clearTimeout(timer)
      try { resolve(Schema.decodeUnknownSync(modelsSchema)(value)) }
      catch { reject(new Error("Invalid model catalog response.")) }
      void worker.terminate().catch(() => {})
    })
    worker.once("error", () => {
      clearTimeout(timer)
      reject(new Error("Could not load the model catalog. Try again."))
    })
    worker.once("exit", () => {
      clearTimeout(timer)
      reject(new Error("Model catalog worker exited."))
    })
  }).finally(() => { pending.delete(all) })
  pending.set(all, request)
  return request
}
