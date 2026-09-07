import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
import { spawn } from "node:child_process"

const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve("vite"))("esbuild")
const root = await mkdtemp(path.join(tmpdir(), "ernie-agent-history-"))
const source = path.join(root, "source")
const home = path.join(root, "history")
await mkdir(path.join(source, "src"), { recursive: true })
await Promise.all(
  [
    "package.json",
    "pnpm-lock.yaml",
    "zenbu.config.ts",
    "zenbu.plugin.ts",
    "zenbu.plugins.jsonc",
    "tsconfig.json",
  ].map((file) => writeFile(path.join(source, file), "{}")),
)
await writeFile(path.join(source, "src", "app.ts"), "quoted application source")
await esbuild.build({
  bundle: true,
  format: "esm",
  outfile: path.join(root, "controller.mjs"),
  platform: "node",
  stdin: {
    contents:
      'export {HistoryController} from "./src/host/history/controller"; export {serveHistory} from "./src/host/history/transport";',
    resolveDir: process.cwd(),
  },
})
await esbuild.build({
  bundle: true,
  entryPoints: ["src/host/history/agent-cli.ts"],
  format: "esm",
  outfile: path.join(root, "agent.mjs"),
  platform: "node",
})
const { HistoryController, serveHistory } = await import(
  pathToFileURL(path.join(root, "controller.mjs"))
)
const controller = await HistoryController.open({
  activation: {
    install: async () => {
      // This fixture does not install checkpoints.
    },
    open: async () => {
      // This fixture does not launch a desktop.
    },
    requestApproval: () => {
      // Agent activation is unavailable, so this fixture needs no approval UI.
    },
  },
  dataGeneration: 1,
  home,
  hostVersion: "fixture",
  initialSource: source,
  managed: true,
  recoveryAvailable: true,
})
const close = await serveHistory(controller, home)
const run = async (args, input = "") => {
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {agentMain} from ${JSON.stringify(pathToFileURL(path.join(root, "agent.mjs")).href)};await agentMain(process.argv.slice(1));`,
      "--",
      ...args,
    ],
    { env: { ...process.env, ERNIE_HISTORY_HOME: home }, stdio: ["pipe", "pipe", "pipe"] },
  )
  let error = ""
  let output = ""
  child.stdout.on("data", (chunk) => (output += chunk))
  child.stderr.on("data", (chunk) => (error += chunk))
  const exited = once(child, "exit")
  child.stdin.end(input)
  const [code] = await exited
  if (code !== 0) {
    throw new Error(error)
  }
  return output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
}
try {
  const [cli] = await run(["history.status"])
  const rpc = await run(
    ["--mcp"],
    `${[
      { id: 1, jsonrpc: "2.0", method: "initialize" },
      { id: 2, jsonrpc: "2.0", method: "tools/list" },
      {
        id: 3,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "history_status" },
      },
      {
        id: 4,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {}, name: "history_activate" },
      },
    ]
      .map((item) => JSON.stringify(item))
      .join("\n")}\n`,
  )
  const status = JSON.parse(rpc.find((item) => item.id === 3).result.content[0].text)
  assert.equal(cli.value.currentCheckpointId, status.value.currentCheckpointId)
  assert.equal(status.value.workspace, source)
  assert.ok(rpc.find((item) => item.id === 4).error)
  assert.ok(
    !rpc
      .find((item) => item.id === 2)
      .result.tools.some((tool) => tool.name === "history_activate"),
  )
  console.log("CLI and MCP agree on workspace and checkpoint; activation is unavailable to agents.")
} finally {
  await close()
  controller.stopWatching()
  await rm(root, { force: true, recursive: true })
}
