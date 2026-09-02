import { readFile, rm } from "node:fs/promises"
import { parseRuntimeDescriptor, type RuntimeDescriptor } from "../../src/dev/runtime-descriptor.ts"
import type { DevelopmentOwner } from "./ownership.ts"

export async function readRuntimeDescriptor(path: string): Promise<RuntimeDescriptor> {
  return parseRuntimeDescriptor(JSON.parse(await readFile(path, "utf8")))
}

export async function waitForRuntimeDescriptor(
  path: string,
  generation: string | undefined,
  isChildRunning: () => boolean,
  timeoutMs = 45_000,
): Promise<RuntimeDescriptor> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    if (!isChildRunning()) throw new Error("The Zenbu service host exited before it became ready")
    try {
      const descriptor = await readRuntimeDescriptor(path)
      if (generation === undefined || descriptor.generation === generation) return descriptor
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }

  throw new Error("Timed out waiting for the Zenbu service host", { cause: lastError })
}

export async function removeRuntimeDescriptor(path: string) {
  await rm(path, { force: true })
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export function assertRuntimeAttachment(
  descriptor: RuntimeDescriptor,
  owner: DevelopmentOwner,
  isRunning: (pid: number) => boolean,
) {
  if (descriptor.generation !== owner.generation
    || !isRunning(owner.pid)
    || !isRunning(descriptor.ownerPid)) {
    throw new Error("The saved Zenbu service host is stale; restart `nub run dev:server`")
  }
}
