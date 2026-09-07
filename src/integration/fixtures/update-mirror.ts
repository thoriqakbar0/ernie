import { execFileSync, spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"
import type { TestContext } from "node:test"
import { promisify } from "node:util"

// Git hooks export repository paths; fixture commands must discover only their temporary repositories.
const fixtureEnvironment = () =>
  Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")))

const writeHeader = (response: ServerResponse, line: string) => {
  const colon = line.indexOf(":")
  if (colon === -1) {
    return
  }
  const key = line.slice(0, colon)
  const value = line.slice(colon + 1).trim()
  if (key.toLowerCase() === "status") {
    response.statusCode = Number(value.slice(0, 3))
  } else {
    response.setHeader(key, value)
  }
}

const writeResponse = (response: ServerResponse, output: Buffer) => {
  const boundary = output.indexOf("\r\n\r\n")
  if (boundary === -1) {
    response.statusCode = 500
    response.end()
    return
  }
  for (const line of output.subarray(0, boundary).toString().split("\r\n")) {
    writeHeader(response, line)
  }
  response.end(output.subarray(boundary + 4))
}

const serveGit = (root: string, request: IncomingMessage, response: ServerResponse) => {
  const url = new URL(request.url ?? "/", "http://localhost")
  const child = spawn("git", ["http-backend"], {
    env: {
      ...fixtureEnvironment(),
      CONTENT_LENGTH: request.headers["content-length"] ?? "",
      CONTENT_TYPE: request.headers["content-type"] ?? "",
      GIT_HTTP_EXPORT_ALL: "1",
      GIT_PROJECT_ROOT: root,
      PATH_INFO: url.pathname,
      QUERY_STRING: url.search.slice(1),
      REQUEST_METHOD: request.method ?? "GET",
    },
    stdio: ["pipe", "pipe", "ignore"],
  })
  request.pipe(child.stdin)
  const chunks: Buffer[] = []
  child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk))
  child.once("error", () => {
    response.statusCode = 500
    response.end()
  })
  child.once("close", () => writeResponse(response, Buffer.concat(chunks)))
}

const startServer = async (t: TestContext, root: string) => {
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.method ?? "GET")
    serveGit(root, request, response)
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  t.after(() => promisify(server.close.bind(server))())
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind TCP")
  }
  return { requests, url: `http://127.0.0.1:${address.port}/mirror` }
}

/** Creates a local Git mirror and HTTP endpoint; no production repository or daemon is contacted. */
export const createUpdateMirror = async (t: TestContext, root: string) => {
  const repository = path.join(root, "mirror")
  const appsDir = path.join(root, "live")
  await mkdir(repository)
  const git = (args: string[], cwd = repository) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf-8",
      env: { ...fixtureEnvironment(), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()
  git(["init", "-b", "release"])
  git(["config", "user.name", "Integration"])
  git(["config", "user.email", "integration@example.invalid"])
  const commit = async (version: string, host: string) => {
    await writeFile(
      path.join(repository, "package.json"),
      JSON.stringify({ name: "ernie", version, zenbu: { host } }),
    )
    git(["add", "package.json"])
    git(["commit", "-m", version])
  }
  await commit("0.1.0", ">=0.1.0 <0.2.0")
  git(["clone", repository, appsDir], root)
  const { url, requests } = await startServer(t, root)
  return {
    commit,
    context: { appsDir, hostVersion: "0.1.0", mirror: { branch: "release", url } },
    head: () => git(["rev-parse", "HEAD"], appsDir),
    requests,
  }
}
