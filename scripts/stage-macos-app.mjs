import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";

const dist = path.resolve("dist");
const source = path.join(dist, "mac-arm64", "Ernie Dev.app");
const target = path.join(dist, "Ernie Dev.app");
if (!fs.existsSync(source)) throw new Error(`Missing packaged app: ${source}`);
fs.rmSync(target, { recursive: true, force: true });
fs.renameSync(source, target);
fs.rmSync(path.dirname(source), { recursive: true, force: true });
process.stdout.write(`${target}
`);
