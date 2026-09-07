import { randomUUID } from "node:crypto"
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { spawn } from "node:child_process"

const runAfter = async (previous, operation) => {
  await previous
  await operation()
}

const root = path.resolve(import.meta.dirname, "..")
const isNodeError = (error, code) =>
  error instanceof Error && "code" in error && error.code === code

const isSafeName = (value) =>
  typeof value === "string" &&
  /^[a-z0-9][a-z0-9._-]*$/u.test(value) &&
  value !== "." &&
  value !== ".."

const confinedPath = (parent, child) => {
  const target = path.resolve(parent, child)
  const relative = path.relative(parent, target)
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes its vendored root: ${child}`)
  }
  return target
}

const parseSparsePath = (repositoryName, sourcePath) => {
  if (typeof sourcePath !== "string" || sourcePath.length === 0 || sourcePath.includes("\\")) {
    throw new Error(`${repositoryName}: sparse paths must be non-empty POSIX paths`)
  }
  const normalized = path.posix.normalize(sourcePath)
  const segments = sourcePath.split("/")
  if (
    normalized !== sourcePath ||
    sourcePath.startsWith("/") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error(`${repositoryName}: unsafe sparse path ${sourcePath}`)
  }
  return sourcePath
}

const parseManifest = (input) => {
  if (!input || typeof input !== "object" || !Array.isArray(input.repositories)) {
    throw new Error("repos.lock.json must contain a repositories array")
  }
  const names = new Set()
  const repositories = input.repositories.map((repository) => {
    if (!repository || typeof repository !== "object") {
      throw new Error("Invalid repository entry")
    }
    if (!isSafeName(repository.name)) {
      throw new Error("Repository name must be one safe path segment")
    }
    if (names.has(repository.name)) {
      throw new Error(`Duplicate repository name: ${repository.name}`)
    }
    names.add(repository.name)
    if (typeof repository.repository !== "string" || repository.repository.length === 0) {
      throw new Error(`${repository.name}: repository is required`)
    }
    if (typeof repository.commit !== "string" || !/^[0-9a-f]{40}$/u.test(repository.commit)) {
      throw new Error(`${repository.name}: commit must be a full SHA`)
    }
    if (!Array.isArray(repository.paths) || repository.paths.length === 0) {
      throw new Error(`${repository.name}: paths are required`)
    }
    const paths = repository.paths.map((sourcePath) => parseSparsePath(repository.name, sourcePath))
    return {
      commit: repository.commit,
      name: repository.name,
      paths,
      repository: repository.repository,
    }
  })
  return { repositories }
}

const readLocalSources = async () => {
  try {
    const input = JSON.parse(await readFile(path.join(root, "repos.local.json"), "utf-8"))
    if (
      !input ||
      typeof input !== "object" ||
      !input.sources ||
      typeof input.sources !== "object"
    ) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(input.sources).filter(
        ([name, source]) => isSafeName(name) && typeof source === "string",
      ),
    )
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      return {}
    }
    throw error
  }
}

const run = async (command, args) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
  let stdout = ""
  let stderr = ""
  child.stdout.setEncoding("utf-8").on("data", (chunk) => {
    stdout += chunk
  })
  child.stderr.setEncoding("utf-8").on("data", (chunk) => {
    stderr += chunk
  })
  const [code] = await once(child, "exit")
  if (code !== 0) {
    throw new Error(`${command} exited with ${code}: ${stderr.trim()}`)
  }
  return stdout
}

const prepareLocalSource = async (repository, temporaryRoot, localPath) => {
  const source = path.resolve(localPath)
  const commitOutput = await run("git", ["-C", source, "rev-parse", repository.commit])
  const actualCommit = commitOutput.trim()
  if (actualCommit !== repository.commit) {
    throw new Error(`${repository.name} does not contain ${repository.commit}`)
  }

  const archive = path.join(temporaryRoot, "source.tar")
  const extracted = path.join(temporaryRoot, "source")
  await mkdir(extracted)
  await run("git", [
    "-C",
    source,
    "archive",
    "--format=tar",
    `--output=${archive}`,
    repository.commit,
    ...repository.paths,
  ])
  await run("tar", ["-xf", archive, "-C", extracted])
  return extracted
}

const prepareRemoteSource = async (repository, temporaryRoot) => {
  const checkout = path.join(temporaryRoot, "checkout")
  await mkdir(checkout)
  await run("git", ["-C", checkout, "init"])
  await run("git", ["-C", checkout, "remote", "add", "origin", repository.repository])
  await run("git", ["-C", checkout, "sparse-checkout", "set", "--no-cone", ...repository.paths])
  await run("git", [
    "-C",
    checkout,
    "fetch",
    "--depth=1",
    "--filter=blob:none",
    "origin",
    repository.commit,
  ])
  await run("git", ["-C", checkout, "checkout", "--detach", "FETCH_HEAD"])
  return checkout
}

const recoverInterruptedSwap = async (destination, backup) => {
  try {
    await rename(backup, destination)
  } catch (error) {
    if (
      isNodeError(error, "ENOENT") ||
      isNodeError(error, "EEXIST") ||
      isNodeError(error, "ENOTEMPTY")
    ) {
      return
    }
    throw error
  }
}

const replaceSnapshot = async (staging, destination, backup) => {
  await rm(backup, { force: true, recursive: true })
  let hadDestination = true
  try {
    await rename(destination, backup)
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) {
      throw error
    }
    hadDestination = false
  }

  try {
    await rename(staging, destination)
  } catch (error) {
    if (hadDestination) {
      await rename(backup, destination)
    }
    throw error
  }
  await rm(backup, { force: true, recursive: true })
}

const manifest = parseManifest(
  JSON.parse(await readFile(path.join(root, "repos.lock.json"), "utf-8")),
)
const localSources = await readLocalSources()
const [selectedName] = process.argv.slice(2)
const selectedRepositories = selectedName
  ? manifest.repositories.filter((repository) => repository.name === selectedName)
  : manifest.repositories

if (selectedName && selectedRepositories.length === 0) {
  throw new Error(`Unknown vendored repository: ${selectedName}`)
}

const syncRepository = async (repository) => {
  const reposRoot = path.join(root, "repos")
  const destination = confinedPath(reposRoot, repository.name)
  const staging = confinedPath(reposRoot, `.${repository.name}.staging-${randomUUID()}`)
  const backup = confinedPath(reposRoot, `.${repository.name}.previous`)
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), `ernie-vendor-${repository.name}-`))
  await mkdir(reposRoot, { recursive: true })
  await recoverInterruptedSwap(destination, backup)

  try {
    const localSource = localSources[repository.name]
    const source = localSource
      ? await prepareLocalSource(repository, temporaryRoot, localSource)
      : await prepareRemoteSource(repository, temporaryRoot)

    await mkdir(staging)
    let pendingCopy = Promise.resolve()
    for (const sourcePath of repository.paths) {
      pendingCopy = runAfter(pendingCopy, () =>
        cp(confinedPath(source, sourcePath), confinedPath(staging, sourcePath), {
          force: true,
          recursive: true,
        }),
      )
    }
    await pendingCopy
    await writeFile(
      path.join(staging, ".vendor-source.json"),
      `${JSON.stringify(
        {
          commit: repository.commit,
          paths: repository.paths,
          repository: repository.repository,
        },
        null,
        2,
      )}\n`,
    )
    await replaceSnapshot(staging, destination, backup)
    console.log(`Synced ${repository.name} at ${repository.commit}`)
  } finally {
    await rm(staging, { force: true, recursive: true })
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

let pendingSync = Promise.resolve()
for (const repository of selectedRepositories) {
  pendingSync = runAfter(pendingSync, () => syncRepository(repository))
}
await pendingSync
