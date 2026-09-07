import { chmod, open, readFile, rm } from "node:fs/promises"
import { setTimeout } from "node:timers/promises"
import { Schema } from "effect"

const DevelopmentOwnerSchema = Schema.Struct({
  generation: Schema.NonEmptyString,
  pid: Schema.Number,
})
export type DevelopmentOwner = typeof DevelopmentOwnerSchema.Type
const parseDevelopmentOwner = Schema.decodeUnknownSync(DevelopmentOwnerSchema)

export type DevelopmentOwnership = Readonly<{ release: () => Promise<void> }>

const isNodeError = (error: unknown, code: string): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === code

const isProcessRunning = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export const readDevelopmentOwner = async (filePath: string): Promise<DevelopmentOwner> =>
  parseDevelopmentOwner(JSON.parse(await readFile(filePath, "utf-8")))

const acquireShortLivedLock = (filePath: string) => {
  const deadline = Date.now() + 2000
  const attempt = async (): Promise<() => Promise<void>> => {
    try {
      const handle = await open(filePath, "wx", 0o600)
      await handle.writeFile(`${process.pid}\n`)
      await handle.close()
      return () => rm(filePath, { force: true })
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) {
        throw error
      }
      if (Date.now() >= deadline) {
        throw new Error(`Development ownership acquisition is stuck at ${filePath}`, {
          cause: error,
        })
      }
      await setTimeout(10)
      return attempt()
    }
  }
  return attempt()
}

const removeStaleOwner = async (filePath: string) => {
  try {
    const owner = await readDevelopmentOwner(filePath)
    if (isProcessRunning(owner.pid)) {
      throw new Error(
        "This Ernie development profile is already running; use another ERNIE_DEV_PROFILE",
      )
    }
    await rm(filePath, { force: true })
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return
    }
    if (error instanceof Error && error.message.startsWith("This Ernie development profile")) {
      throw error
    }
    await rm(filePath, { force: true })
  }
}

export const acquireDevelopmentOwnership = async (
  filePath: string,
  generation: string,
): Promise<DevelopmentOwnership> => {
  const releaseAcquisitionLock = await acquireShortLivedLock(`${filePath}.acquire`)
  try {
    await removeStaleOwner(filePath)
    const handle = await open(filePath, "wx", 0o600).catch((error: unknown) => {
      if (isNodeError(error, "EEXIST")) {
        throw new Error(
          "This Ernie development profile is already running; use another ERNIE_DEV_PROFILE",
        )
      }
      throw error
    })
    try {
      const owner: DevelopmentOwner = { generation, pid: process.pid }
      await handle.writeFile(`${JSON.stringify(owner)}\n`)
    } catch (error) {
      try {
        await handle.close()
      } catch {
        // Continue cleanup even if closing the handle fails.
      }
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
        if (current.generation === generation) {
          await rm(filePath, { force: true })
        }
      } catch {
        // Releasing ownership is best-effort.
      }
    },
  }
}
