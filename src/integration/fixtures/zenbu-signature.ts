import { createHash } from "node:crypto"
import * as fsp from "node:fs/promises"
import path from "node:path"
import { runInNewContext } from "node:vm"

/** Reads Zenbu's actual pure digest implementation without loading its Electron services. Fails on contract drift. */
export const zenbuSignature = async (
  directory: string,
  pm: { type: string; version: string },
): Promise<unknown> => {
  const dist = path.resolve("node_modules/@zenbujs/core/dist")
  const filenames = await fsp.readdir(dist)
  const filename = filenames.find((name) => /^updater-.*\.mjs$/u.test(name))
  if (!filename) {
    throw new Error("Installed Zenbu updater was not found")
  }
  const source = await fsp.readFile(path.join(dist, filename), "utf-8")
  const start = source.indexOf("async function fileHash(")
  const end = source.indexOf("\n/**", start)
  if (start === -1 || end <= start) {
    throw new Error("Zenbu's signature implementation changed")
  }
  // Execute only the installed, pinned package's hashing functions against the temporary fixture.
  const signature: unknown = runInNewContext(`${source.slice(start, end)}; depsSignature`, {
    crypto: { createHash },
    fsp,
    lockfileFor: () => "pnpm-lock.yaml",
    path,
    process,
  })
  if (typeof signature !== "function") {
    throw new TypeError("Invalid Zenbu signature function")
  }
  return signature(directory, pm)
}
