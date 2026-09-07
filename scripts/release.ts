import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { Schema } from "effect"
import semver from "semver"

const destination = Schema.decodeUnknownSync(
  Schema.Struct({ branch: Schema.String, target: Schema.String }),
)(JSON.parse(readFileSync("release.json", "utf-8")))
const manifest = Schema.decodeUnknownSync(
  Schema.Struct({ version: Schema.String, zenbu: Schema.Struct({ host: Schema.String }) }),
)(JSON.parse(readFileSync("package.json", "utf-8")))
const [command = "check", ...extra] = process.argv.slice(2)
if (extra.length || !["check", "init", "push", "build"].includes(command)) {
  throw new Error("Use release.ts check, init, push, or build without overrides")
}
if (
  !/^[\w.-]+\/[\w.-]+$/u.test(destination.target) ||
  !/^[a-zA-Z0-9][\w/-]*$/u.test(destination.branch) ||
  ["main", "master"].includes(destination.branch)
) {
  throw new Error("Choose a dedicated source distribution branch in release.json")
}
if (!semver.valid(manifest.version) || !semver.satisfies(manifest.version, manifest.zenbu.host)) {
  throw new Error("The source compatibility range must include this host version")
}
console.log(
  `Release destination: ${destination.target}#${destination.branch}; host ${manifest.version}`,
)
const run = (args: string[]) => {
  const result = spawnSync("nub", args, { stdio: "inherit" })
  if (result.status !== 0) {
    throw new Error("Release command failed")
  }
}
if (command !== "check") {
  const status = spawnSync("git", ["status", "--porcelain"], { encoding: "utf-8" })
  if (status.status !== 0 || status.stdout.trim()) {
    throw new Error("Release operations require a clean committed checkout")
  }
  if (command === "build") {
    const apiKey =
      process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER
    const appleId =
      process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID
    if (process.platform !== "darwin" || !(apiKey || appleId)) {
      throw new Error("release:build requires macOS and configured Apple notarization credentials")
    }
  }
  run(["run", "build:source"])
  if (command === "build") {
    run([
      "--node",
      "node_modules/@zenbujs/core/dist/cli/bin.mjs",
      "build:electron",
      "--",
      "--publish",
      "never",
      "-c.forceCodeSigning=true",
      "-c.mac.hardenedRuntime=true",
      "-c.mac.notarize=true",
    ])
  } else {
    // Passing a full URL avoids Zenbu logging a URL containing GH_TOKEN/GITHUB_TOKEN.
    // Git's configured credential helper handles publisher authentication.
    const env = { ...process.env }
    delete env.GH_TOKEN
    delete env.GITHUB_TOKEN
    const result = spawnSync(
      "nub",
      [
        "exec",
        "zen",
        "publish:source",
        command,
        "--target",
        `https://github.com/${destination.target}.git`,
        "--branch",
        destination.branch,
      ],
      { env, stdio: "inherit" },
    )
    if (result.status !== 0) {
      throw new Error("Source publication failed")
    }
  }
}
