import { mkdirSync, lstatSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"

/** Named profiles isolate application-owned state, not OS filesystem permissions. */
export const configureProfile = (app) => {
  const name = process.env.ERNIE_PROFILE
  if (name === undefined) {
    return
  }
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/u.test(name)) {
    throw new Error("Invalid ERNIE_PROFILE: use 1–64 lowercase letters, digits, dots or hyphens")
  }
  const root = path.join(homedir(), ".ernie", "profiles", name)
  const directories = [
    root,
    ...["electron", "prime", "sessions", "history"].map((part) => path.join(root, part)),
  ]
  for (const directory of directories) {
    mkdirSync(directory, { mode: 0o700, recursive: true })
    if (lstatSync(directory).isSymbolicLink()) {
      throw new Error("Profile directories must not be symlinks")
    }
  }
  const socketId = createHash("sha256").update(root).digest("hex").slice(0, 16)
  // A short socket path avoids macOS sockaddr_un limits for long home directories.
  const socketDirectory = path.join(tmpdir(), `ernie-${socketId}`)
  mkdirSync(socketDirectory, { mode: 0o700, recursive: true })
  if (lstatSync(socketDirectory).isSymbolicLink()) {
    throw new Error("Profile socket directory must not be a symlink")
  }
  Object.assign(process.env, {
    ERNIE_HISTORY_HOME: path.join(root, "history"),
    ERNIE_PRIME_AGENT_SOCKET: path.join(socketDirectory, "daemon.sock"),
    ERNIE_PRIME_AGENT_START_DAEMON: "1",
    NODE_ENV: "production",
    PRIME_AGENT_CODING_AGENT_DIR: path.join(root, "prime"),
    PRIME_AGENT_CODING_AGENT_SESSION_DIR: path.join(root, "sessions"),
    PRIME_AGENT_SESSION_DIR: path.join(root, "sessions"),
  })
  app.setPath("userData", path.join(root, "electron"))
  return { history: path.join(root, "history"), root, source: path.join(root, "source") }
}
