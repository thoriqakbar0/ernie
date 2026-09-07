import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { Schema } from "effect"
import { constVoid } from "effect/Function"
import type { HttpService } from "@zenbujs/core/services"

import { parseRuntimeDescriptor } from "../dev/runtime-descriptor.ts"
import type { RuntimeDescriptor } from "../dev/runtime-descriptor.ts"

const rendererMode = Schema.Literals(["desktop", "server"])

export const readRendererMode = (): typeof rendererMode.Type =>
  Schema.decodeUnknownSync(rendererMode)(process.env.ERNIE_RENDERER_MODE ?? "desktop")

export const registerDesktopSmokeConnectionProbe = (http: HttpService) => {
  const filePath = process.env.ERNIE_DESKTOP_SMOKE_READY_FILE
  if (!filePath) {
    return constVoid
  }
  if (!path.isAbsolute(filePath)) {
    throw new Error("ERNIE_DESKTOP_SMOKE_READY_FILE must be an absolute path")
  }
  const markConnected = () => {
    writeFileSync(filePath, "connected\n", { mode: 0o600 })
  }
  const unsubscribe = http.onConnected(markConnected)
  if (http.activeConnections.size > 0) {
    markConnected()
  }
  return unsubscribe
}

const isNodeError = (error: unknown, code: string): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error && error.code === code

const removeOwnedRuntimeDescriptor = async (filePath: string, generation: string) => {
  let current: RuntimeDescriptor
  try {
    current = parseRuntimeDescriptor(JSON.parse(await readFile(filePath, "utf-8")))
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return
    }
    throw error
  }
  if (current.generation === generation) {
    await rm(filePath, { force: true })
  }
}

export const publishRuntimeDescriptor = async (http: HttpService) => {
  const filePath = process.env.ERNIE_DEV_RUNTIME_FILE
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new Error("ERNIE_DEV_RUNTIME_FILE must be an absolute path in server mode")
  }

  const descriptor: RuntimeDescriptor = {
    authToken: http.authToken,
    generation: process.env.ERNIE_DEV_GENERATION ?? randomUUID(),
    origin: `http://127.0.0.1:${http.port}`,
    ownerPid: process.pid,
    version: 1,
  }
  const temporaryPath = `${filePath}.${descriptor.generation}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(descriptor)}\n`, { mode: 0o600 })
  await chmod(temporaryPath, 0o600)
  await rename(temporaryPath, filePath)

  return () => removeOwnedRuntimeDescriptor(filePath, descriptor.generation)
}
