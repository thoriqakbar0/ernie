import { readFileSync, writeFileSync } from "node:fs"
import { Schema } from "effect"
import semver from "semver"

const [version, ...extra] = process.argv.slice(2)
if (extra.length || !version || !semver.valid(version)) {
  throw new Error("Use release:prepare <semver>")
}
const manifest = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(
  JSON.parse(readFileSync("package.json", "utf-8")),
)
writeFileSync(
  "package.json",
  `${JSON.stringify({ ...manifest, version, zenbu: { host: version } }, null, 2)}\n`,
)
console.log(`Prepared Ernie ${version}. Review the local changes before committing.`)
