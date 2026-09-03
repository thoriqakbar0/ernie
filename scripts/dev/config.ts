import { isAbsolute, join, resolve } from "node:path"
import { Schema } from "effect"
import { defaultDaemonSocketPath } from "prime-agent"

const DevRole = Schema.Literals(["all", "server", "web", "desktop"])

export type DevRole = typeof DevRole.Type
export type DaemonLifecycle = "shared" | "owned" | "external"

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
  agentDirectory: string | undefined
  daemonSocketPath: string
  daemonLifecycle: DaemonLifecycle
  electronProfileDirectory: string
}>

// @lat: [[development#Development workflow#Development profiles]]
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
  const configuredDaemonSocket = env.ERNIE_PRIME_AGENT_SOCKET
  if (configuredDaemonSocket && !isAbsolute(configuredDaemonSocket)) {
    throw new Error("ERNIE_PRIME_AGENT_SOCKET must be an absolute path")
  }
  const daemonLifecycle: DaemonLifecycle = configuredDaemonSocket
    ? "external"
    : role === "desktop"
      ? "owned"
      : "shared"

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
    agentDirectory: daemonLifecycle === "owned" ? join(stateRoot, "prime-agent") : undefined,
    daemonSocketPath: configuredDaemonSocket ?? (
      daemonLifecycle === "shared" ? defaultDaemonSocketPath() : resolveDaemonSocketPath(stateRoot, profile)
    ),
    daemonLifecycle,
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
