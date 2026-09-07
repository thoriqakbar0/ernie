import { createHash } from "node:crypto"
import * as fsp from "node:fs/promises"
import * as path from "node:path"

/** Reads Zenbu's actual pure digest implementation without loading its Electron services. Fails on contract drift. */
export async function zenbuSignature(directory: string, pm: { type: string; version: string }): Promise<unknown> {
  const dist = path.resolve("node_modules/@zenbujs/core/dist")
  const filename = (await fsp.readdir(dist)).find((name) => /^updater-.*\.mjs$/.test(name))
  if (!filename) throw new Error("Installed Zenbu updater was not found")
  const source = await fsp.readFile(path.join(dist, filename), "utf8")
  const start = source.indexOf("async function fileHash(")
  const end = source.indexOf("\n/**", start)
  if (start < 0 || end <= start) throw new Error("Zenbu's signature implementation changed")
  // Execute only the installed, pinned package's hashing functions against the temporary fixture.
  const signature: unknown = new Function("crypto", "fsp", "path", "lockfileFor", `${source.slice(start, end)}; return depsSignature`)({ createHash }, fsp, path, () => "pnpm-lock.yaml")
  if (typeof signature !== "function") throw new Error("Invalid Zenbu signature function")
  return signature(directory, pm)
}
