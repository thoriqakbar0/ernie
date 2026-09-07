import fs from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import git from "isomorphic-git"
import { createGitHttpClient } from "./git-http"
import semver from "semver"
import { Schema } from "effect"
import { ReleaseManifest } from "../../packages/updates"

/** Expected update failures expose only an actionable message to the renderer. */
class UpdateFailureError extends Error {
  override name = "UpdateFailureError"
  readonly _tag = "UpdateFailure"
}

export { UpdateFailureError as UpdateFailure }

/** Installed bundle context supplied by Zenbu, never by renderer commands. */
export type SourceContext = Readonly<{
  appsDir: string
  hostVersion: string
  mirror: Readonly<{ url: string; branch: string }>
}>
/** A checked immutable source revision awaiting explicit application. */
export type Candidate = Readonly<{
  directory: string
  revision: string
  version: string
  currentRevision: string
}>

const remoteRevision = async (context: SourceContext, signal?: AbortSignal) => {
  const ref = `refs/heads/${context.mirror.branch}`
  const refs = await git.listServerRefs({
    http: createGitHttpClient(signal),
    prefix: ref,
    url: context.mirror.url,
  })
  const revision = refs.find((entry) => entry.ref === ref)?.oid
  if (!revision) {
    throw new UpdateFailureError("The release branch is unavailable. Try again later.")
  }
  return revision
}

/** Refuses an update when tracked files or the installed revision changed after checking. */
export const assertInstallationUnchanged = async (context: SourceContext, candidate: Candidate) => {
  const [revision, rows] = await Promise.all([
    git.resolveRef({ dir: context.appsDir, fs, ref: "HEAD" }),
    git.statusMatrix({ dir: context.appsDir, fs }),
  ])
  if (
    revision !== candidate.currentRevision ||
    rows.some(([filepath, head, worktree, stage]) => {
      // Our restart manifest survives a cancelled quit; it is not release source.
      if (
        context.appsDir === candidate.directory &&
        filepath === ".ernie-update-tracked.json" &&
        head === 0 &&
        stage === 0
      ) {
        return false
      }
      return head !== worktree || head !== stage
    })
  ) {
    throw new UpdateFailureError(
      "The installation has local changes. Restore them before updating.",
    )
  }
}

const reuseCandidate = async (
  context: SourceContext,
  previous: Candidate | null | undefined,
  revision: string,
  currentRevision: string,
) => {
  if (previous?.revision !== revision || previous.currentRevision !== currentRevision) {
    return null
  }
  try {
    await assertInstallationUnchanged(
      { ...context, appsDir: previous.directory },
      { ...previous, currentRevision: revision },
    )
    return previous
  } catch {
    return null
  }
}

const cloneRelease = async (
  context: SourceContext,
  currentRevision: string,
  signal?: AbortSignal,
): Promise<Candidate | null> => {
  const directory = await mkdtemp(path.join(path.dirname(context.appsDir), ".ernie-update-"))
  try {
    await git.clone({
      depth: 1,
      dir: directory,
      fs,
      http: createGitHttpClient(signal),
      ref: context.mirror.branch,
      singleBranch: true,
      url: context.mirror.url,
    })
    const revision = await git.resolveRef({ dir: directory, fs, ref: "HEAD" })
    if (revision === currentRevision) {
      await rm(directory, { force: true, recursive: true })
      return null
    }
    const manifest = Schema.decodeUnknownSync(ReleaseManifest)(
      JSON.parse(await readFile(path.join(directory, "package.json"), "utf-8")),
    )
    if (
      !semver.valid(manifest.version) ||
      !semver.validRange(manifest.zenbu.host) ||
      !semver.satisfies(context.hostVersion, manifest.zenbu.host)
    ) {
      throw new UpdateFailureError("This release requires a newer Electron package.")
    }
    return { currentRevision, directory, revision, version: manifest.version }
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

/** Checks metadata first and retains a validated candidate until the published revision changes. */
export const inspectRelease = async (
  context: SourceContext,
  signal?: AbortSignal,
  previous?: Candidate | null,
): Promise<Candidate | null> => {
  const [currentRevision, advertised] = await Promise.all([
    git.resolveRef({ dir: context.appsDir, fs, ref: "HEAD" }),
    remoteRevision(context, signal),
  ])
  if (advertised === currentRevision) {
    return null
  }
  const cached = await reuseCandidate(context, previous, advertised, currentRevision)
  return cached ?? cloneRelease(context, currentRevision, signal)
}
