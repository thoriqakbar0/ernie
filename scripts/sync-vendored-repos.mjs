import { randomUUID } from "node:crypto"
import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path, { join, resolve } from "node:path"
import { spawn } from "node:child_process"

const root = resolve(import.meta.dirname, "..")
const manifest = parseManifest(JSON.parse(await readFile(join(root, "repos.lock.json"), "utf8")))
const localSources = await readLocalSources()
const selectedName = process.argv[2]
const repositories = selectedName
  ? manifest.repositories.filter((repository) => repository.name === selectedName)
  : manifest.repositories

if (selectedName && repositories.length === 0) {
  throw new Error(`Unknown vendored repository: ${selectedName}`)
}

for (const repository of repositories) await syncRepository(repository)

async function syncRepository(repository) {
  const reposRoot = join(root, "repos")
  const destination = confinedPath(reposRoot, repository.name)
  const staging = confinedPath(reposRoot, `.${repository.name}.staging-${randomUUID()}`)
  const backup = confinedPath(reposRoot, `.${repository.name}.previous`)
  const temporaryRoot = await mkdtemp(join(tmpdir(), `ernie-vendor-${repository.name}-`))
  await mkdir(reposRoot, { recursive: true })
  await recoverInterruptedSwap(destination, backup)

  try {
    const localSource = localSources[repository.name]
    const source = localSource
      ? await prepareLocalSource(repository, temporaryRoot, localSource)
      : await prepareRemoteSource(repository, temporaryRoot)

    await mkdir(staging)
    for (const sourcePath of repository.paths) {
      await cp(
        confinedPath(source, sourcePath),
        confinedPath(staging, sourcePath),
        { recursive: true, force: true },
      )
    }
    await writeFile(
      join(staging, ".vendor-source.json"),
      `${JSON.stringify({
        repository: repository.repository,
        commit: repository.commit,
        paths: repository.paths,
      }, null, 2)}\n`,
    )
    await replaceSnapshot(staging, destination, backup)
    console.log(`Synced ${repository.name} at ${repository.commit}`)
  } finally {
    await rm(staging, { recursive: true, force: true })
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function replaceSnapshot(staging, destination, backup) {
  await rm(backup, { recursive: true, force: true })
  let hadDestination = true
  try {
    await rename(destination, backup)
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error
    hadDestination = false
  }

  try {
    await rename(staging, destination)
  } catch (error) {
    if (hadDestination) await rename(backup, destination)
    throw error
  }
  await rm(backup, { recursive: true, force: true })
}

async function recoverInterruptedSwap(destination, backup) {
  try {
    await rename(backup, destination)
  } catch (error) {
    if (isNodeError(error, "ENOENT") || isNodeError(error, "EEXIST") || isNodeError(error, "ENOTEMPTY")) return
    throw error
  }
}

async function prepareLocalSource(repository, temporaryRoot, localPath) {
  const source = resolve(localPath)
  const actualCommit = (await run("git", ["-C", source, "rev-parse", repository.commit])).trim()
  if (actualCommit !== repository.commit) {
    throw new Error(`${repository.name} does not contain ${repository.commit}`)
  }

  const archive = join(temporaryRoot, "source.tar")
  const extracted = join(temporaryRoot, "source")
  await mkdir(extracted)
  await run("git", ["-C", source, "archive", "--format=tar", `--output=${archive}`, repository.commit, ...repository.paths])
  await run("tar", ["-xf", archive, "-C", extracted])
  return extracted
}

async function prepareRemoteSource(repository, temporaryRoot) {
  const checkout = join(temporaryRoot, "checkout")
  await mkdir(checkout)
  await run("git", ["-C", checkout, "init"])
  await run("git", ["-C", checkout, "remote", "add", "origin", repository.repository])
  await run("git", ["-C", checkout, "sparse-checkout", "set", "--no-cone", ...repository.paths])
  await run("git", ["-C", checkout, "fetch", "--depth=1", "--filter=blob:none", "origin", repository.commit])
  await run("git", ["-C", checkout, "checkout", "--detach", "FETCH_HEAD"])
  return checkout
}

async function readLocalSources() {
  try {
    const input = JSON.parse(await readFile(join(root, "repos.local.json"), "utf8"))
    if (!input || typeof input !== "object" || !input.sources || typeof input.sources !== "object") return {}
    return Object.fromEntries(
      Object.entries(input.sources).filter(([name, source]) => isSafeName(name) && typeof source === "string"),
    )
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return {}
    throw error
  }
}

function parseManifest(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.repositories)) {
    throw new Error("repos.lock.json must contain a repositories array")
  }
  const names = new Set()
  const repositories = input.repositories.map((repository) => {
    if (!repository || typeof repository !== "object") throw new Error("Invalid repository entry")
    if (!isSafeName(repository.name)) throw new Error("Repository name must be one safe path segment")
    if (names.has(repository.name)) throw new Error(`Duplicate repository name: ${repository.name}`)
    names.add(repository.name)
    if (typeof repository.repository !== "string" || repository.repository.length === 0) {
      throw new Error(`${repository.name}: repository is required`)
    }
    if (typeof repository.commit !== "string" || !/^[0-9a-f]{40}$/.test(repository.commit)) {
      throw new Error(`${repository.name}: commit must be a full SHA`)
    }
    if (!Array.isArray(repository.paths) || repository.paths.length === 0) {
      throw new Error(`${repository.name}: paths are required`)
    }
    const paths = repository.paths.map((sourcePath) => parseSparsePath(repository.name, sourcePath))
    return {
      name: repository.name,
      repository: repository.repository,
      commit: repository.commit,
      paths,
    }
  })
  return { repositories }
}

function parseSparsePath(repositoryName, sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath.length === 0 || sourcePath.includes("\\")) {
    throw new Error(`${repositoryName}: sparse paths must be non-empty POSIX paths`)
  }
  const normalized = path.posix.normalize(sourcePath)
  const segments = sourcePath.split("/")
  if (normalized !== sourcePath || sourcePath.startsWith("/") || segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error(`${repositoryName}: unsafe sparse path ${sourcePath}`)
  }
  return sourcePath
}

function confinedPath(parent, child) {
  const target = resolve(parent, child)
  const relative = path.relative(parent, target)
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes its vendored root: ${child}`)
  }
  return target
}

function isSafeName(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9._-]*$/.test(value) && value !== "." && value !== ".."
}

function isNodeError(error, code) {
  return error instanceof Error && "code" in error && error.code === code
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code) => {
      if (code === 0) resolveRun(stdout)
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`))
    })
  })
}
