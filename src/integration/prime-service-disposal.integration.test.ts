import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { promisify } from "node:util"
import test from "node:test"

const execute = promisify(execFile)

const runFixture = async (refreshBurst: boolean) => {
  const require = createRequire(import.meta.url)
  const electron: unknown = require("electron")
  assert.equal(typeof electron, "string")
  if (typeof electron !== "string") {
    throw new TypeError("Electron executable is unavailable")
  }
  // Vite already owns esbuild; bundle only repository TypeScript for Electron.
  const esbuild = createRequire(import.meta.resolve("vite")).resolve("esbuild/bin/esbuild")
  const directory = await mkdtemp(path.resolve("node_modules/.ernie-disposal-"))
  try {
    const entry = path.join(directory, "fixture.mjs")
    await execute(esbuild, [
      "src/integration/fixtures/prime-service-disposal.ts",
      "--bundle",
      "--platform=node",
      "--packages=external",
      "--format=esm",
      `--outfile=${entry}`,
    ])
    const environment = { ...process.env }
    delete environment.ELECTRON_RUN_AS_NODE
    delete environment.NODE_OPTIONS
    const result = await execute(
      electron,
      [
        entry,
        ...(refreshBurst ? ["--refresh-burst"] : []),
        `--user-data-dir=${path.join(directory, "profile")}`,
      ],
      {
        env: environment,
        killSignal: "SIGKILL",
        timeout: 15_000,
      },
    )
    assert.match(result.stdout, /service disposal verified/u, result.stderr)
    if (refreshBurst) {
      console.log(result.stdout.trim())
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

// @lat: [[tests#Behavior specifications#Daemon boundary#Service disposal]]
test(
  "service shutdown joins a pending native attachment and rejects later acquisition",
  { timeout: 20_000 },
  () => runFixture(false),
)

// @lat: [[tests#Behavior specifications#Daemon boundary#Refresh burst coalescing]]
test(
  "event bursts bound projection work and preserve updates during a native read",
  { timeout: 20_000 },
  () => runFixture(true),
)
