import { execFileSync, spawn } from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { join } from "node:path"
import type { TestContext } from "node:test"

// Git hooks export repository paths; fixture commands must discover only their temporary repositories.
function fixtureEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))
}

function writeHeader(response: ServerResponse, line: string) {
  const colon = line.indexOf(":")
  if (colon < 0) return
  const key = line.slice(0, colon), value = line.slice(colon + 1).trim()
  if (key.toLowerCase() === "status") response.statusCode = Number(value.slice(0, 3))
  else response.setHeader(key, value)
}

function writeResponse(response: ServerResponse, output: Buffer) {
  const boundary = output.indexOf("\r\n\r\n")
  if (boundary < 0) { response.statusCode = 500; response.end(); return }
  for (const line of output.subarray(0, boundary).toString().split("\r\n")) writeHeader(response, line)
  response.end(output.subarray(boundary + 4))
}

function serveGit(root: string, request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost")
  const child = spawn("git", ["http-backend"], { env: { ...fixtureEnvironment(), GIT_PROJECT_ROOT: root, GIT_HTTP_EXPORT_ALL: "1", PATH_INFO: url.pathname, QUERY_STRING: url.search.slice(1), REQUEST_METHOD: request.method ?? "GET", CONTENT_TYPE: request.headers["content-type"] ?? "", CONTENT_LENGTH: request.headers["content-length"] ?? "" }, stdio: ["pipe", "pipe", "ignore"] })
  request.pipe(child.stdin)
  const chunks: Buffer[] = []
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
  child.once("error", () => { response.statusCode = 500; response.end() })
  child.once("close", () => writeResponse(response, Buffer.concat(chunks)))
}

async function startServer(t: TestContext, root: string) {
  const requests: string[] = []
  const server = createServer((request, response) => { requests.push(request.method ?? "GET"); serveGit(root, request, response) })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Fixture server did not bind TCP")
  return { url: `http://127.0.0.1:${address.port}/mirror`, requests }
}

/** Creates a local Git mirror and HTTP endpoint; no production repository or daemon is contacted. */
export async function createUpdateMirror(t: TestContext, root: string) {
  const repository = join(root, "mirror"), appsDir = join(root, "live")
  await mkdir(repository)
  const git = (args: string[], cwd = repository) => execFileSync("git", args, { cwd, env: { ...fixtureEnvironment(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
  git(["init", "-b", "release"])
  git(["config", "user.name", "Integration"])
  git(["config", "user.email", "integration@example.invalid"])
  const commit = async (version: string, host: string) => {
    await writeFile(join(repository, "package.json"), JSON.stringify({ name: "ernie", version, zenbu: { host } }))
    git(["add", "package.json"]); git(["commit", "-m", version])
  }
  await commit("0.1.0", ">=0.1.0 <0.2.0")
  git(["clone", repository, appsDir], root)
  const { url, requests } = await startServer(t, root)
  return { context: { appsDir, hostVersion: "0.1.0", mirror: { url, branch: "release" } }, requests, commit, head: () => git(["rev-parse", "HEAD"], appsDir) }
}
