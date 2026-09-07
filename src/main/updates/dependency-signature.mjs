import { createHash } from "node:crypto"
import { readFile, mkdir, writeFile, rename } from "node:fs/promises"
import { join } from "node:path"

/** Matches Zenbu 0.6's signature using staged bytes and their final installed paths. */
export async function installedSignature(staged, live, pm, electronVersion) {
  if (pm.type !== "pnpm") throw new Error("Unsupported bundled package manager")
  const hash = createHash("sha256")
  for (const file of ["package.json", "pnpm-lock.yaml"]) {
    hash.update(join(live, file)); hash.update("\0")
    hash.update(await readFile(join(staged, file))); hash.update("\0")
  }
  for (const value of [`${pm.type}@${pm.version}`, electronVersion, process.platform]) { hash.update(value); hash.update("\0") }
  hash.update(process.arch)
  return hash.digest("hex")
}

/** Commits the dependency marker only after source and dependencies have moved successfully. */
export async function saveInstalledSignature(live, signature) {
  if (signature === undefined) return
  if (!/^[a-f0-9]{64}$/.test(signature)) throw new Error("Invalid dependency signature")
  const directory = join(live, ".zenbu")
  await mkdir(directory, { recursive: true })
  const temporary = join(directory, `deps-sig-${process.pid}.tmp`)
  await writeFile(temporary, signature)
  await rename(temporary, join(directory, "deps-sig"))
}
