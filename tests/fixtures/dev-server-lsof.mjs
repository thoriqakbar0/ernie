#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const listenerArgs = ["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"];
if (JSON.stringify(args) === JSON.stringify(listenerArgs)) {
  if (process.env.ERNIE_LSOF_LOG !== undefined) appendFileSync(process.env.ERNIE_LSOF_LOG, "start\n");
  const delay = Number(process.env.ERNIE_LSOF_DELAY_MS ?? "0");
  if (Number.isFinite(delay) && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  process.stdout.write([
    "p12",
    "n127.0.0.1:5173",
    "n[::1]:3000",
    "n0.0.0.0:8080",
    "n0.0.0.0:9000",
    "p34",
    "n127.0.0.1:4173",
    "p56",
    "n192.168.1.2:8000",
    "",
  ].join("\n"));
  if (process.env.ERNIE_LSOF_LOG !== undefined) appendFileSync(process.env.ERNIE_LSOF_LOG, "end\n");
  process.exit(0);
}

const pidIndex = args.indexOf("-p");
const expectedShape = args[0] === "-a" && pidIndex === 1 && args[3] === "-d" && args[4] === "cwd" && args[5] === "-F" && args[6] === "n";
if (!expectedShape || args.length !== 7 || !/^[1-9][0-9]*$/u.test(args[pidIndex + 1] ?? "")) process.exit(64);
const pid = args[pidIndex + 1];
if (pid === "12") {
  process.stdout.write(`n${fileURLToPath(new URL(".", import.meta.url))}\n`);
  process.exit(0);
}
if (pid === "34") {
  process.stdout.write("n/tmp\n");
  process.exit(0);
}
process.exit(1);
