import { createHash, randomUUID } from "node:crypto"
import { lstat, mkdir, readdir, readFile, rename, writeFile, chmod, open, rm } from "node:fs/promises"
import { dirname, isAbsolute, join, resolve, sep } from "node:path"
import { Effect } from "effect"
import { HistoryFailure, type Checkpoint } from "../../packages/app-history"

/** Immutable capture policy is compiled into the host, not read from editable source. */
export const sourceManifest = {
  directories: ["src", "build/brand"],
  required: ["package.json", "pnpm-lock.yaml", "zenbu.config.ts", "zenbu.plugin.ts", "zenbu.plugins.jsonc", "tsconfig.json"],
  optional: ["electron-builder.json", ".gitignore", "vite.config.ts", "doctor.config.json"],
} as const
const excluded = new Set(["node_modules", ".git", ".zenbu", "dist", "coverage", "logs", "credentials", "sessions", ".npmrc", ".yarnrc", ".yarnrc.yml", ".aws", ".ssh", "auth.json", "credentials.json"])
/** Pure path policy applies to capture and materialization, including restored metadata. */
export function permittedPath(path: string): boolean {
  if (!path || isAbsolute(path) || path.includes("\\")) return false
  const parts = path.split("/")
  if (parts.some(part => !part || part === "." || part === ".." || excluded.has(part) || part.startsWith(".env") || /\.(pem|key|p12|pfx|sqlite|sqlite3|db)$/i.test(part))) return false
  return [...sourceManifest.required, ...sourceManifest.optional].some(file => file === path)
    || sourceManifest.directories.some(directory => path.startsWith(`${directory}/`))
}
/** Content identity is independent of capture timestamps. */
export function hashContent(bytes: Uint8Array | string) { return createHash("sha256").update(bytes).digest("hex") }
/** Atomic replacement is used for metadata, pointers, and restore journals. */
export async function atomicWrite(path: string, content: string | Uint8Array) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
  await writeFile(temporary, content, { mode: 0o600 })
  const file = await open(temporary, "r")
  try { await file.sync() } finally { await file.close() }
  await rename(temporary, path)
  const directory = await open(dirname(path), "r")
  try { await directory.sync() } finally { await directory.close() }
  } finally { await rm(temporary, { force: true }) }
}
/** Captures and validates application bytes without following filesystem symlinks. */
export class SourceStore {
  constructor(readonly objects: string) {}
  private async scan(root: string, persist: boolean) {
    if ((await lstat(root)).isSymbolicLink()) throw new HistoryFailure({ code: "unsupported_workspace", message: "The managed source root cannot be a symbolic link.", nextAction: "Use the installed app’s managed directory." })
    const files: Checkpoint["files"][number][] = []
    const visit = async (relative: string, optional = false): Promise<void> => {
      const path = join(root, relative)
      const info = await lstat(path).catch((error: unknown) => {
        if (optional && error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
        throw error
      })
      if (!info) return
      if (info.isSymbolicLink()) throw new HistoryFailure({ code: "capture_failed", message: `Cannot checkpoint symbolic link: ${relative}`, nextAction: "Replace the link with an application file." })
      if (info.isDirectory()) {
        for (const name of (await readdir(path)).sort()) {
          if (excluded.has(name) || name.startsWith(".env") || /\.(pem|key|p12|pfx|sqlite|sqlite3|db)$/i.test(name)) continue
          await visit(`${relative}/${name}`)
        }
      } else if (info.isFile() && permittedPath(relative)) {
        if (info.size > 128 * 1024 ** 2 || files.reduce((size, file) => size + file.size, 0) + info.size > 1024 ** 3) throw new HistoryFailure({ code: "storage_limit", message: "Application source exceeds the capture size limit.", nextAction: "Move large user data out of application source and retry." })
        const bytes = await readFile(path)
        const hash = hashContent(bytes)
        if (persist) {
          const stored = await readFile(join(this.objects, hash)).catch((error: unknown) => {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
            throw error
          })
          if (!stored || hashContent(stored) !== hash) await atomicWrite(join(this.objects, hash), bytes)
        }
        files.push({ path: relative, hash, size: bytes.length, executable: Boolean(info.mode & 0o111) })
      } else throw new HistoryFailure({ code: "capture_failed", message: `Unsupported application entry: ${relative}`, nextAction: "Use regular application files." })
    }
    for (const directory of sourceManifest.directories) await visit(directory, directory === "build/brand")
    for (const path of sourceManifest.required) await visit(path)
    for (const path of sourceManifest.optional) await visit(path, true)
    if (!files.some(file => file.path.startsWith("src/"))) throw new HistoryFailure({ code: "capture_failed", message: "Required application source is missing.", nextAction: "Repair the managed application before capturing a checkpoint." })
    files.sort((a, b) => a.path.localeCompare(b.path))
    return { files, tree: hashContent(JSON.stringify(files)) }
  }
  /** Two matching reads are required before publishing a tree. */
  capture(root: string) {
    return Effect.tryPromise({ try: async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const first = await this.scan(root, true)
        const second = await this.scan(root, false)
        if (first.tree === second.tree) return first
      }
      throw new HistoryFailure({ code: "files_changing", message: "Waiting for edits to settle.", nextAction: "Pause editing and retry checkpoint creation." })
    }, catch: failure })
  }
  /** Reads verified immutable content. Corrupt objects never reach restored source. */
  async bytes(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw failure(new Error("Invalid object identity"))
    const bytes = await readFile(join(this.objects, hash))
    if (hashContent(bytes) !== hash) throw failure(new Error("Checkpoint object failed integrity verification"))
    return bytes
  }
  /** Verifies the full manifest and every object before restoration is offered. */
  async verify(checkpoint: Checkpoint, verified = new Map<string, number>()) {
    if (checkpoint.tree !== hashContent(JSON.stringify(checkpoint.files))
      || new Set(checkpoint.files.map(file => file.path)).size !== checkpoint.files.length
      || !sourceManifest.required.every(path => checkpoint.files.some(file => file.path === path))
      || !checkpoint.files.some(file => file.path.startsWith("src/"))) {
      throw new HistoryFailure({ code: "checkpoint_incomplete", message: "The checkpoint manifest is incomplete or damaged.", nextAction: "Choose another checkpoint." })
    }
    for (const file of checkpoint.files) {
      let size = verified.get(file.hash)
      if (size === undefined) { size = (await this.bytes(file.hash)).length; verified.set(file.hash, size) }
      if (!permittedPath(file.path) || size !== file.size) {
        throw new HistoryFailure({ code: "checkpoint_incomplete", message: "Checkpoint integrity checks failed.", nextAction: "Choose another checkpoint." })
      }
    }
  }
  /** Materializes into a newly allocated directory, never the active generation. */
  async materialize(checkpoint: Checkpoint, destination: string) {
    await this.verify(checkpoint)
    await mkdir(destination, { recursive: false, mode: 0o700 })
    for (const entry of checkpoint.files) {
      if (!permittedPath(entry.path)) throw failure(new Error("Checkpoint contains an unsupported path"))
      const target = resolve(destination, entry.path)
      if (!target.startsWith(resolve(destination) + sep)) throw failure(new Error("Checkpoint path escapes generation"))
      await atomicWrite(target, await this.bytes(entry.hash))
      if (entry.executable) await chmod(target, 0o700)
    }
  }
}
/** Preserves classified failures without exposing arbitrary filesystem errors. */
export function failure(cause: unknown): HistoryFailure {
  return cause instanceof HistoryFailure ? cause : new HistoryFailure({ code: "capture_failed", message: "App history could not read or save the required application files.", nextAction: "Check the application directory and available storage, then retry." })
}
