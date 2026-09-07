import path from "node:path"
import { Schema } from "effect"
import { VERSION } from "prime-agent"
import {
  managedDaemonSocketName,
  existingDaemonSocketPath,
} from "../../src/main/prime-agent/daemon-client.ts"

const DevRoleSchema = Schema.Literals(["all", "server", "web", "desktop"])

type DevRole = typeof DevRoleSchema.Type
type DaemonLifecycle = "external"

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

export const resolveDaemonSocketPath = (
  stateRoot: string,
  profile: string,
  platform: NodeJS.Platform = process.platform,
) =>
  platform === "win32"
    ? ["", "", ".", "pipe", `ernie-prime-agent-${profile}-v${VERSION}`].join("\\")
    : path.join(stateRoot, managedDaemonSocketName)

// @lat: [[development#Development workflow#Development profiles]]
export const readDevConfig = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  projectRoot: string,
): DevConfig => {
  const role = Schema.decodeUnknownSync(DevRoleSchema)(argv[0] ?? "all")
  const profile = env.ERNIE_DEV_PROFILE ?? (role === "desktop" ? "desktop" : "browser")
  if (!/^[a-zA-Z0-9._-]+$/u.test(profile)) {
    throw new Error(
      "ERNIE_DEV_PROFILE may contain only letters, numbers, dots, underscores, and hyphens",
    )
  }

  const rawPort = env.ERNIE_DEV_PORT ?? "4310"
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`ERNIE_DEV_PORT must be an integer from 1 to 65535; received ${rawPort}`)
  }

  const root = path.resolve(projectRoot)
  const configuredStateRoot = env.ERNIE_DEV_STATE_ROOT
  if (configuredStateRoot && !path.isAbsolute(configuredStateRoot)) {
    throw new Error("ERNIE_DEV_STATE_ROOT must be an absolute path")
  }
  const stateRoot = configuredStateRoot || path.join(root, ".zenbu", "dev", profile)
  const configuredDaemonSocket = env.ERNIE_PRIME_AGENT_SOCKET
  if (configuredDaemonSocket && !path.isAbsolute(configuredDaemonSocket)) {
    throw new Error("ERNIE_PRIME_AGENT_SOCKET must be an absolute path")
  }
  const daemonLifecycle: DaemonLifecycle = "external"

  return {
    agentDirectory: undefined,
    daemonLifecycle,
    daemonSocketPath: configuredDaemonSocket ?? existingDaemonSocketPath(),
    databaseDirectory: path.join(stateRoot, "db"),
    electronProfileDirectory: path.join(stateRoot, "electron-user-data"),
    host: "127.0.0.1",
    ownerFile: path.join(stateRoot, "owner.json"),
    port,
    profile,
    role,
    root,
    runtimeFile: path.join(stateRoot, "runtime.json"),
    stateRoot,
  }
}
