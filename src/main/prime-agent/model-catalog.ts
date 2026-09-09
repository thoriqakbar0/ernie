import { once } from "node:events"
import { Worker } from "node:worker_threads"
import { Schema } from "effect"
import type { AgentConnectionModel } from "prime-agent"
import { PrimeEffortSchema } from "../../packages/prime-agent"
import type { PrimeModel } from "../../packages/prime-agent"

const modelsSchema = Schema.Array(
  Schema.Struct({
    available: Schema.Boolean,
    cost: Schema.Struct({ input: Schema.Number, output: Schema.Number }),
    id: Schema.String,
    label: Schema.String,
    provider: Schema.String,
    supportedEfforts: Schema.Array(PrimeEffortSchema),
  }),
)

// Prime Agent's registry performs synchronous file reads. Isolate those reads
// and catalog construction from the host event loop; return metadata only.
const workerSource = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { findPackageJSON } = require("node:module");
  const { readFile } = require("node:fs/promises");
  const { pathToFileURL } = require("node:url");
  const packagePath = findPackageJSON("@earendil-works/pi-ai", workerData.moduleUrl);
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  const entry = manifest.exports?.["."]?.import;
  if (typeof entry !== "string" || !entry.startsWith("./")) throw new Error("Missing native model export");
  const { getSupportedThinkingLevels } = await import(new URL(entry, pathToFileURL(packagePath)).href);
  let configured = workerData.models;
  let catalog = configured;
  if (!configured) {
    const { AuthStorage, ModelRegistry } = await import(workerData.moduleUrl);
    const registry = ModelRegistry.create(AuthStorage.create());
    configured = registry.getAvailable();
    catalog = workerData.all ? registry.getAll() : configured;
  }
  const available = new Set(configured.map(model => model.provider + ':' + model.id));
  parentPort.postMessage(catalog.map(model => ({
    id: model.id, provider: model.provider, label: model.name ?? model.id,
    cost: { input: model.cost.input, output: model.cost.output },
    available: available.has(model.provider + ':' + model.id),
    supportedEfforts: getSupportedThinkingLevels(model)
  })));
})().catch(() => process.exit(1));
`

const loadModelCatalog = async (
  input: { all: boolean } | { models: readonly AgentConnectionModel[] },
): Promise<readonly PrimeModel[]> => {
  const worker = new Worker(workerSource, {
    eval: true,
    execArgv: [],
    workerData: { ...input, moduleUrl: import.meta.resolve("prime-agent") },
  })
  const controller = new AbortController()
  const { signal } = controller
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    let response: unknown[] | null
    try {
      response = await Promise.race([
        once(worker, "message", { signal }),
        (async () => {
          await once(worker, "exit", { signal })
          return null
        })(),
      ])
    } catch {
      if (signal.aborted) {
        throw new Error("Model catalog timed out. Try again.")
      }
      throw new Error("Could not load the model catalog. Try again.")
    }
    if (response === null) {
      throw new Error("Model catalog worker exited.")
    }
    try {
      return Schema.decodeUnknownSync(modelsSchema)(response[0])
    } catch {
      throw new Error("Invalid model catalog response.")
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
    void Promise.allSettled([worker.terminate()])
  }
}

const pending = new Map<boolean, Promise<readonly PrimeModel[]>>()
export const readModelCatalog = (all = false): Promise<readonly PrimeModel[]> => {
  const existing = pending.get(all)
  if (existing) {
    return existing
  }
  const request = (async () => {
    await Promise.resolve()
    try {
      return await loadModelCatalog({ all })
    } finally {
      pending.delete(all)
    }
  })()
  pending.set(all, request)
  return request
}

/** Projects attached model capabilities with the same native helper as the saved registry. */
export const projectModelCatalog = (models: readonly AgentConnectionModel[]) =>
  loadModelCatalog({ models })
