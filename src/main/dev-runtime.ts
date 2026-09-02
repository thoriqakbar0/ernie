import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import { isAbsolute } from "node:path"
import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import type { HttpService } from "@zenbujs/core/services"

import { parseRuntimeDescriptor, type RuntimeDescriptor } from "../dev/runtime-descriptor.ts"

const rendererMode = Schema.Literals(["desktop", "server"])

export function readRendererMode(): typeof rendererMode.Type {
  return Schema.decodeUnknownSync(rendererMode)(process.env.ERNIE_RENDERER_MODE ?? "desktop")
}

export function registerDesktopSmokeConnectionProbe(http: HttpService) {
  const filePath = process.env.ERNIE_DESKTOP_SMOKE_READY_FILE
  if (!filePath) return () => {}
  if (!isAbsolute(filePath)) {
    throw new Error("ERNIE_DESKTOP_SMOKE_READY_FILE must be an absolute path")
  }
  const markConnected = () => {
    writeFileSync(filePath, "connected\n", { mode: 0o600 })
  }
  const unsubscribe = http.onConnected(markConnected)
  if (http.activeConnections.size > 0) markConnected()
  return unsubscribe
}

export async function publishRuntimeDescriptor(http: HttpService) {
  const filePath = process.env.ERNIE_DEV_RUNTIME_FILE
  if (!filePath || !isAbsolute(filePath)) {
    throw new Error("ERNIE_DEV_RUNTIME_FILE must be an absolute path in server mode")
  }

  const descriptor: RuntimeDescriptor = {
    version: 1,
    generation: process.env.ERNIE_DEV_GENERATION ?? randomUUID(),
    ownerPid: process.pid,
    origin: `http://127.0.0.1:${http.port}`,
    authToken: http.authToken,
  }
  const temporaryPath = `${filePath}.${descriptor.generation}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(descriptor)}\n`, { mode: 0o600 })
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, filePath)

  return () => removeOwnedRuntimeDescriptor(filePath, descriptor.generation)
}

async function removeOwnedRuntimeDescriptor(filePath: string, generation: string) {
  let current: RuntimeDescriptor
  try {
    current = parseRuntimeDescriptor(JSON.parse(await readFile(filePath, "utf8")))
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return
    throw error
  }
  if (current.generation === generation) await rm(filePath, { force: true })
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code
}
