import { createHash } from "node:crypto"
import { readFile, mkdir, writeFile, rename } from "node:fs/promises"
import path from "node:path"

/** Matches Zenbu 0.6's signature using staged bytes and their final installed paths. */
export const installedSignature = async (staged, live, pm, electronVersion) => {
  if (pm.type !== "pnpm") {
    throw new Error("Unsupported bundled package manager")
  }
  const hash = createHash("sha256")
  const files = ["package.json", "pnpm-lock.yaml"]
  const contents = await Promise.all(files.map((file) => readFile(path.join(staged, file))))
  for (const [index, file] of files.entries()) {
    hash.update(path.join(live, file))
    hash.update("\0")
    hash.update(contents[index])
    hash.update("\0")
  }
  for (const value of [`${pm.type}@${pm.version}`, electronVersion, process.platform]) {
    hash.update(value)
    hash.update("\0")
  }
  hash.update(process.arch)
  return hash.digest("hex")
}

/** Commits the dependency marker only after source and dependencies have moved successfully. */
export const saveInstalledSignature = async (live, signature) => {
  if (signature === undefined) {
    return
  }
  if (!/^[a-f0-9]{64}$/u.test(signature)) {
    throw new Error("Invalid dependency signature")
  }
  const directory = path.join(live, ".zenbu")
  await mkdir(directory, { recursive: true })
  const temporary = path.join(directory, `deps-sig-${process.pid}.tmp`)
  await writeFile(temporary, signature)
  await rename(temporary, path.join(directory, "deps-sig"))
}
