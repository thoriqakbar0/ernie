import fs from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import git from "isomorphic-git"
import { createGitHttpClient } from "./git-http"
import semver from "semver"
import { Schema } from "effect"
import { ReleaseManifest } from "../../packages/updates"

/** Expected update failures expose only an actionable message to the renderer. */
export class UpdateFailure extends Error {
  readonly _tag = "UpdateFailure"
}

/** Installed bundle context supplied by Zenbu, never by renderer commands. */
export type SourceContext = Readonly<{ appsDir: string; hostVersion: string; mirror: Readonly<{ url: string; branch: string }> }>
/** A checked immutable source revision awaiting explicit application. */
export type Candidate = Readonly<{ directory: string; revision: string; version: string; currentRevision: string }>

async function remoteRevision(context: SourceContext, signal?: AbortSignal) {
  const ref = `refs/heads/${context.mirror.branch}`
  const refs = await git.listServerRefs({ http: createGitHttpClient(signal), url: context.mirror.url, prefix: ref })
  const revision = refs.find((entry) => entry.ref === ref)?.oid
  if (!revision) throw new UpdateFailure("The release branch is unavailable. Try again later.")
  return revision
}

async function reuseCandidate(context: SourceContext, previous: Candidate | null | undefined, revision: string, currentRevision: string) {
  if (previous?.revision !== revision || previous.currentRevision !== currentRevision) return null
  try {
    await assertInstallationUnchanged({ ...context, appsDir: previous.directory }, { ...previous, currentRevision: revision })
    return previous
  } catch { return null }
}

/** Checks metadata first and retains a validated candidate until the published revision changes. */
export async function inspectRelease(context: SourceContext, signal?: AbortSignal, previous?: Candidate | null): Promise<Candidate | null> {
  const currentRevision = await git.resolveRef({ fs, dir: context.appsDir, ref: "HEAD" })
  const advertised = await remoteRevision(context, signal)
  if (advertised === currentRevision) return null
  const cached = await reuseCandidate(context, previous, advertised, currentRevision)
  return cached ?? cloneRelease(context, currentRevision, signal)
}

async function cloneRelease(context: SourceContext, currentRevision: string, signal?: AbortSignal): Promise<Candidate | null> {
  const directory = await mkdtemp(join(dirname(context.appsDir), ".ernie-update-"))
  try {
    await git.clone({ fs, http: createGitHttpClient(signal), dir: directory, url: context.mirror.url, ref: context.mirror.branch, singleBranch: true, depth: 1 })
    const revision = await git.resolveRef({ fs, dir: directory, ref: "HEAD" })
    if (revision === currentRevision) { await rm(directory, { recursive: true, force: true }); return null }
    const manifest = Schema.decodeUnknownSync(ReleaseManifest)(JSON.parse(await readFile(join(directory, "package.json"), "utf8")))
    if (!semver.valid(manifest.version) || !semver.validRange(manifest.zenbu.host) || !semver.satisfies(context.hostVersion, manifest.zenbu.host)) {
      throw new UpdateFailure("This release requires a newer Electron package.")
    }
    return { directory, revision, version: manifest.version, currentRevision }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

/** Refuses an update when tracked files or the installed revision changed after checking. */
export async function assertInstallationUnchanged(context: SourceContext, candidate: Candidate) {
  const revision = await git.resolveRef({ fs, dir: context.appsDir, ref: "HEAD" })
  const rows = await git.statusMatrix({ fs, dir: context.appsDir })
  if (revision !== candidate.currentRevision || rows.some(([, head, worktree, stage]) => head !== worktree || head !== stage)) {
    throw new UpdateFailure("The installation has local changes. Restore them before updating.")
  }
}
