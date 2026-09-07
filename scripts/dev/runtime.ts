import { readFile, rm } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { parseRuntimeDescriptor } from "../../src/dev/runtime-descriptor.ts"
import type { RuntimeDescriptor } from "../../src/dev/runtime-descriptor.ts"
import type { DevelopmentOwner } from "./ownership.ts"

export const readRuntimeDescriptor = async (path: string): Promise<RuntimeDescriptor> =>
  parseRuntimeDescriptor(JSON.parse(await readFile(path, "utf-8")))

export const waitForRuntimeDescriptor = async (
  path: string,
  generation: string | undefined,
  isChildRunning: () => boolean,
  timeoutMs = 45_000,
): Promise<RuntimeDescriptor> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  const poll = async (): Promise<RuntimeDescriptor> => {
    if (!(Date.now() < deadline)) {
      throw new Error("Timed out waiting for the Zenbu service host", { cause: lastError })
    }
    if (!isChildRunning()) {
      throw new Error("The Zenbu service host exited before it became ready")
    }
    try {
      const descriptor = await readRuntimeDescriptor(path)
      if (generation === undefined || descriptor.generation === generation) {
        return descriptor
      }
    } catch (error) {
      lastError = error
    }
    await delay(100)
    return poll()
  }

  return await poll()
}

export const removeRuntimeDescriptor = async (path: string) => {
  await rm(path, { force: true })
}

export const assertRuntimeAttachment = (
  descriptor: RuntimeDescriptor,
  owner: DevelopmentOwner,
  isRunning: (pid: number) => boolean,
) => {
  if (
    descriptor.generation !== owner.generation ||
    !isRunning(owner.pid) ||
    !isRunning(descriptor.ownerPid)
  ) {
    throw new Error("The saved Zenbu service host is stale; restart `nub run dev:server`")
  }
}
