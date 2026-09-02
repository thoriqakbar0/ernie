import { chmod, open, readFile, rm } from "node:fs/promises"
import { Schema } from "effect"

const DevelopmentOwner = Schema.Struct({
  generation: Schema.NonEmptyString,
  pid: Schema.Number,
})
export type DevelopmentOwner = typeof DevelopmentOwner.Type
const parseDevelopmentOwner = Schema.decodeUnknownSync(DevelopmentOwner)

export type DevelopmentOwnership = Readonly<{ release: () => Promise<void> }>

export async function readDevelopmentOwner(filePath: string): Promise<DevelopmentOwner> {
  return parseDevelopmentOwner(JSON.parse(await readFile(filePath, "utf8")))
}

export async function acquireDevelopmentOwnership(
  filePath: string,
  generation: string,
): Promise<DevelopmentOwnership> {
  const releaseAcquisitionLock = await acquireShortLivedLock(`${filePath}.acquire`)
  try {
    await removeStaleOwner(filePath)
    const handle = await open(filePath, "wx", 0o600).catch((error: unknown) => {
      if (isNodeError(error, "EEXIST")) {
        throw new Error("This Ernie development profile is already running; use another ERNIE_DEV_PROFILE")
      }
      throw error
    })
    try {
      const owner: DevelopmentOwner = { generation, pid: process.pid }
      await handle.writeFile(`${JSON.stringify(owner)}\n`)
    } catch (error) {
      await handle.close().catch(() => undefined)
      await rm(filePath, { force: true })
      throw error
    }
    await handle.close()
    await chmod(filePath, 0o600)
  } finally {
    await releaseAcquisitionLock()
  }

  return {
    release: async () => {
      try {
        const current = await readDevelopmentOwner(filePath)
        if (current.generation === generation) await rm(filePath, { force: true })
      } catch {
        return
      }
    },
  }
}

async function acquireShortLivedLock(filePath: string) {
  const deadline = Date.now() + 2_000
  while (true) {
    try {
      const handle = await open(filePath, "wx", 0o600)
      await handle.writeFile(`${process.pid}\n`)
      await handle.close()
      return async () => rm(filePath, { force: true })
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error
      if (Date.now() >= deadline) {
        throw new Error(`Development ownership acquisition is stuck at ${filePath}`)
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10))
    }
  }
}

async function removeStaleOwner(filePath: string) {
  try {
    const owner = await readDevelopmentOwner(filePath)
    if (isProcessRunning(owner.pid)) {
      throw new Error("This Ernie development profile is already running; use another ERNIE_DEV_PROFILE")
    }
    await rm(filePath, { force: true })
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return
    if (error instanceof Error && error.message.startsWith("This Ernie development profile")) throw error
    await rm(filePath, { force: true })
  }
}

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code
}
