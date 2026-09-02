import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

type ShutdownDaemonAndWait = (socketPath: string, timeoutMs?: number) => Promise<boolean>

let shutdownDaemonAndWait: ShutdownDaemonAndWait | undefined

export async function shutdownPrimeAgentDaemon(socketPath: string) {
  shutdownDaemonAndWait ??= await loadShutdownDaemonAndWait()
  if (!await shutdownDaemonAndWait(socketPath, 10_000)) {
    throw new Error(`Prime Agent daemon stayed active on ${socketPath}`)
  }
}

async function loadShutdownDaemonAndWait(): Promise<ShutdownDaemonAndWait> {
  const entry = fileURLToPath(import.meta.resolve("prime-agent"))
  const module: unknown = await import(pathToFileURL(
    join(dirname(entry), "cli", "daemon-launch.js"),
  ).href)
  if (!module || typeof module !== "object" || !("shutdownDaemonAndWait" in module)) {
    throw new Error("Prime Agent does not expose daemon shutdown")
  }
  const shutdown = module.shutdownDaemonAndWait
  if (typeof shutdown !== "function") throw new Error("Prime Agent daemon shutdown is not callable")
  return async (socketPath, timeoutMs) => {
    const result: unknown = await Reflect.apply(shutdown, module, [socketPath, timeoutMs])
    if (typeof result !== "boolean") throw new Error("Prime Agent daemon shutdown returned an invalid result")
    return result
  }
}
