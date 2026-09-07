import { createHash, randomUUID } from "node:crypto"
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
  chmod,
  open,
  rm,
} from "node:fs/promises"
import nodePath from "node:path"
import { Effect } from "effect"
import { HistoryFailure } from "../../packages/app-history"
import type { Checkpoint } from "../../packages/app-history"

/** Immutable capture policy is compiled into the host, not read from editable source. */
export const sourceManifest = {
  directories: ["src", "build/brand"],
  optional: ["electron-builder.json", ".gitignore", "vite.config.ts", "doctor.config.json"],
  required: [
    "package.json",
    "pnpm-lock.yaml",
    "zenbu.config.ts",
    "zenbu.plugin.ts",
    "zenbu.plugins.jsonc",
    "tsconfig.json",
  ],
} as const
const excluded = new Set([
  "node_modules",
  ".git",
  ".zenbu",
  "dist",
  "coverage",
  "logs",
  "credentials",
  "sessions",
  ".npmrc",
  ".yarnrc",
  ".yarnrc.yml",
  ".aws",
  ".ssh",
  "auth.json",
  "credentials.json",
])
/** Pure path policy applies to capture and materialization, including restored metadata. */
export const permittedPath = (path: string): boolean => {
  if (!path || nodePath.isAbsolute(path) || path.includes("\\")) {
    return false
  }
  const parts = path.split("/")
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        excluded.has(part) ||
        part.startsWith(".env") ||
        /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/iu.test(part),
    )
  ) {
    return false
  }
  return (
    [...sourceManifest.required, ...sourceManifest.optional].some((file) => file === path) ||
    sourceManifest.directories.some((directory) => path.startsWith(`${directory}/`))
  )
}
/** Content identity is independent of capture timestamps. */
export const hashContent = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex")
/** Atomic replacement is used for metadata, pointers, and restore journals. */
export const atomicWrite = async (path: string, content: string | Uint8Array) => {
  await mkdir(nodePath.dirname(path), { mode: 0o700, recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content, { mode: 0o600 })
    const file = await open(temporary, "r")
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, path)
    const directory = await open(nodePath.dirname(path), "r")
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
  } finally {
    await rm(temporary, { force: true })
  }
}
/** Preserves classified failures without exposing arbitrary filesystem errors. */
export const failure = (cause: unknown): HistoryFailure =>
  cause instanceof HistoryFailure
    ? cause
    : new HistoryFailure({
        code: "capture_failed",
        message: "App history could not read or save the required application files.",
        nextAction: "Check the application directory and available storage, then retry.",
      })
// Chain dependent filesystem operations so failures stop subsequent work.
const inSequence = <T>(items: readonly T[], action: (item: T) => Promise<void>) => {
  const iterator = items.values()
  const next = async (): Promise<void> => {
    const item = iterator.next()
    if (item.done) {
      return
    }
    await action(item.value)
    return next()
  }
  return next()
}
/** Captures and validates application bytes without following filesystem symlinks. */
export class SourceStore {
  readonly objects: string
  constructor(objects: string) {
    this.objects = objects
  }
  private async scan(root: string, persist: boolean) {
    const rootInfo = await lstat(root)
    if (rootInfo.isSymbolicLink()) {
      throw new HistoryFailure({
        code: "unsupported_workspace",
        message: "The managed source root cannot be a symbolic link.",
        nextAction: "Use the installed app’s managed directory.",
      })
    }
    const files: Checkpoint["files"][number][] = []
    const visit = async (relative: string, optional = false): Promise<void> => {
      // Nested manifest entries must validate ancestors before lstat follows them.
      const parts = relative.split("/")
      const checkAncestor = async (depth: number): Promise<boolean> => {
        if (depth >= parts.length) {
          return true
        }
        const ancestor = await lstat(nodePath.join(root, ...parts.slice(0, depth))).catch(
          (error: unknown) => {
            if (optional && error instanceof Error && "code" in error && error.code === "ENOENT") {
              return
            }
            throw error
          },
        )
        if (!ancestor) {
          return false
        }
        if (ancestor.isSymbolicLink()) {
          throw new HistoryFailure({
            code: "capture_failed",
            message: `Cannot checkpoint symbolic link ancestor: ${parts.slice(0, depth).join("/")}`,
            nextAction: "Replace the link with an application directory.",
          })
        }
        return checkAncestor(depth + 1)
      }
      if (!(await checkAncestor(1))) {
        return
      }
      const path = nodePath.join(root, relative)
      const info = await lstat(path).catch((error: unknown) => {
        if (optional && error instanceof Error && "code" in error && error.code === "ENOENT") {
          return
        }
        throw error
      })
      if (!info) {
        return
      }
      if (info.isSymbolicLink()) {
        throw new HistoryFailure({
          code: "capture_failed",
          message: `Cannot checkpoint symbolic link: ${relative}`,
          nextAction: "Replace the link with an application file.",
        })
      }
      if (info.isDirectory()) {
        const names = await readdir(path)
        await inSequence(names.toSorted(), async (name) => {
          if (
            excluded.has(name) ||
            name.startsWith(".env") ||
            /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db)$/iu.test(name)
          ) {
            return
          }
          await visit(`${relative}/${name}`)
        })
      } else if (info.isFile() && permittedPath(relative)) {
        if (
          info.size > 128 * 1024 ** 2 ||
          files.reduce((size, file) => size + file.size, 0) + info.size > 1024 ** 3
        ) {
          throw new HistoryFailure({
            code: "storage_limit",
            message: "Application source exceeds the capture size limit.",
            nextAction: "Move large user data out of application source and retry.",
          })
        }
        const bytes = await readFile(path)
        const hash = hashContent(bytes)
        if (persist) {
          const stored = await readFile(nodePath.join(this.objects, hash)).catch(
            (error: unknown) => {
              if (error instanceof Error && "code" in error && error.code === "ENOENT") {
                return
              }
              throw error
            },
          )
          if (!stored || hashContent(stored) !== hash) {
            await atomicWrite(nodePath.join(this.objects, hash), bytes)
          }
        }
        // Field order is part of the persisted checkpoint tree hash.
        files.push({
          path: relative,
          hash,
          size: bytes.length,
          executable: Boolean(info.mode & 0o111),
        })
      } else {
        throw new HistoryFailure({
          code: "capture_failed",
          message: `Unsupported application entry: ${relative}`,
          nextAction: "Use regular application files.",
        })
      }
    }
    await inSequence(sourceManifest.directories, (directory) =>
      visit(directory, directory === "build/brand"),
    )
    await inSequence(sourceManifest.required, (path) => visit(path))
    await inSequence(sourceManifest.optional, (path) => visit(path, true))
    if (!files.some((file) => file.path.startsWith("src/"))) {
      throw new HistoryFailure({
        code: "capture_failed",
        message: "Required application source is missing.",
        nextAction: "Repair the managed application before capturing a checkpoint.",
      })
    }
    files.sort((a, b) => a.path.localeCompare(b.path))
    return { files, tree: hashContent(JSON.stringify(files)) }
  }
  /** Two matching reads are required before publishing a tree. */
  capture(root: string) {
    return Effect.tryPromise({
      catch: failure,
      try: () => {
        const attemptCapture = async (
          attempt: number,
        ): Promise<Awaited<ReturnType<SourceStore["scan"]>>> => {
          const scans: Awaited<ReturnType<SourceStore["scan"]>>[] = []
          await inSequence([true, false], async (persist) => {
            scans.push(await this.scan(root, persist))
          })
          const [first, second] = scans
          if (first && second && first.tree === second.tree) {
            return first
          }
          if (attempt < 2) {
            return attemptCapture(attempt + 1)
          }
          throw new HistoryFailure({
            code: "files_changing",
            message: "Waiting for edits to settle.",
            nextAction: "Pause editing and retry checkpoint creation.",
          })
        }
        return attemptCapture(0)
      },
    })
  }
  /** Reads verified immutable content. Corrupt objects never reach restored source. */
  async bytes(hash: string) {
    if (!/^[a-f0-9]{64}$/u.test(hash)) {
      throw failure(new Error("Invalid object identity"))
    }
    const bytes = await readFile(nodePath.join(this.objects, hash))
    if (hashContent(bytes) !== hash) {
      throw failure(new Error("Checkpoint object failed integrity verification"))
    }
    return bytes
  }
  /** Verifies the full manifest and every object before restoration is offered. */
  async verify(checkpoint: Checkpoint, verified = new Map<string, number>()) {
    if (
      checkpoint.tree !== hashContent(JSON.stringify(checkpoint.files)) ||
      new Set(checkpoint.files.map((file) => file.path)).size !== checkpoint.files.length ||
      !sourceManifest.required.every((path) =>
        checkpoint.files.some((file) => file.path === path),
      ) ||
      !checkpoint.files.some((file) => file.path.startsWith("src/"))
    ) {
      throw new HistoryFailure({
        code: "checkpoint_incomplete",
        message: "The checkpoint manifest is incomplete or damaged.",
        nextAction: "Choose another checkpoint.",
      })
    }
    await inSequence(checkpoint.files, async (file) => {
      let size = verified.get(file.hash)
      if (size === undefined) {
        const bytes = await this.bytes(file.hash)
        size = bytes.length
        verified.set(file.hash, size)
      }
      if (!permittedPath(file.path) || size !== file.size) {
        throw new HistoryFailure({
          code: "checkpoint_incomplete",
          message: "Checkpoint integrity checks failed.",
          nextAction: "Choose another checkpoint.",
        })
      }
    })
  }
  /** Materializes into a newly allocated directory, never the active generation. */
  async materialize(checkpoint: Checkpoint, destination: string) {
    await this.verify(checkpoint)
    await mkdir(destination, { mode: 0o700, recursive: false })
    await inSequence(checkpoint.files, async (entry) => {
      if (!permittedPath(entry.path)) {
        throw failure(new Error("Checkpoint contains an unsupported path"))
      }
      const target = nodePath.resolve(destination, entry.path)
      if (!target.startsWith(nodePath.resolve(destination) + nodePath.sep)) {
        throw failure(new Error("Checkpoint path escapes generation"))
      }
      await atomicWrite(target, await this.bytes(entry.hash))
      if (entry.executable) {
        await chmod(target, 0o700)
      }
    })
  }
}
