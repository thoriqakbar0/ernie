import { isAbsolute, join, resolve } from "node:path"
import { Schema } from "effect"

const DevRole = Schema.Literals(["all", "server", "web", "desktop"])

export type DevRole = typeof DevRole.Type

export type DevConfig = Readonly<{
  role: DevRole
  root: string
  host: "127.0.0.1"
  port: number
  profile: string
  stateRoot: string
  runtimeFile: string
  ownerFile: string
  databaseDirectory: string
  agentDirectory: string
  daemonSocketPath: string
  electronProfileDirectory: string
}>

export function readDevConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  projectRoot: string,
): DevConfig {
  const role = Schema.decodeUnknownSync(DevRole)(argv[0] ?? "all")
  const profile = env.ERNIE_DEV_PROFILE ?? (role === "desktop" ? "desktop" : "browser")
  if (!/^[a-zA-Z0-9._-]+$/.test(profile)) {
    throw new Error("ERNIE_DEV_PROFILE may contain only letters, numbers, dots, underscores, and hyphens")
  }

  const rawPort = env.ERNIE_DEV_PORT ?? "4310"
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`ERNIE_DEV_PORT must be an integer from 1 to 65535; received ${rawPort}`)
  }

  const root = resolve(projectRoot)
  const configuredStateRoot = env.ERNIE_DEV_STATE_ROOT
  const stateRoot = configuredStateRoot
    ? isAbsolute(configuredStateRoot)
      ? configuredStateRoot
      : (() => { throw new Error("ERNIE_DEV_STATE_ROOT must be an absolute path") })()
    : join(root, ".zenbu", "dev", profile)

  return {
    role,
    root,
    host: "127.0.0.1",
    port,
    profile,
    stateRoot,
    runtimeFile: join(stateRoot, "runtime.json"),
    ownerFile: join(stateRoot, "owner.json"),
    databaseDirectory: join(stateRoot, "db"),
    agentDirectory: join(stateRoot, "prime-agent"),
    daemonSocketPath: resolveDaemonSocketPath(stateRoot, profile),
    electronProfileDirectory: join(stateRoot, "electron-user-data"),
  }
}

export function resolveDaemonSocketPath(
  stateRoot: string,
  profile: string,
  platform: NodeJS.Platform = process.platform,
) {
  return platform === "win32"
    ? ["", "", ".", "pipe", `ernie-prime-agent-${profile}`].join("\\")
    : join(stateRoot, "prime-agent.sock")
}
